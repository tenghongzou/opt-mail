import PostalMime from 'postal-mime';
import type { Env } from './types';
import { sendViaResend, type ResendAttachment } from './resend';

// 反向別名 token 格式：rp + 18 碼 hex（見 genToken）。用來在進站時快速辨識回信。
const REVERSE_RE = /^rp[0-9a-f]{18}$/;
const DEFAULT_DAILY_LIMIT = 50;

/**
 * Cloudflare Email Routing 進站處理。
 *   - 收件地址是反向別名 → 走出站回信（M2，Resend 代寄給外部對象）
 *   - 收件地址是一般別名 → 收信轉發（M0/M1）；有設 RESEND_API_KEY 時改寫 Reply-To 以支援回信
 */
export async function handleEmail(
  message: ForwardableEmailMessage,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const to = message.to.toLowerCase();
  const localPart = to.split('@')[0] ?? '';
  const from = message.from;
  const subject = message.headers.get('subject') || '(無主旨)';

  // 0) 收件地址是反向別名 → 使用者在回信，代寄給外部對象
  if (REVERSE_RE.test(localPart)) {
    await handleReply(message, env, localPart, from, to, subject);
    return;
  }

  const alias = await env.DB.prepare(
    'SELECT id, local_part, destination, active FROM aliases WHERE local_part = ?',
  )
    .bind(localPart)
    .first<{ id: number; local_part: string; destination: string; active: number }>();

  // 1) 已知且啟用 → 轉發到真實信箱
  if (alias && alias.active) {
    await forwardInbound(message, env, alias, from, to, subject);
    return;
  }

  // 2) 已知但已停用 → 靜默收下丟棄（不退信，避免洩漏地址存在與 backscatter），但記次數
  if (alias && !alias.active) {
    await env.DB.prepare('UPDATE aliases SET spam_count = spam_count + 1 WHERE id = ?')
      .bind(alias.id)
      .run();
    await log(env, alias.id, 'in', from, to, subject, 'dropped_disabled');
    return; // 不 forward、不 reject = 收下後丟棄
  }

  // 3) 未知地址 —— catch-all 開著就自動建立並轉發
  if (env.CATCHALL_MODE === 'on' && env.CATCHALL_DESTINATION) {
    try {
      const res = await env.DB.prepare(
        'INSERT INTO aliases (local_part, destination, note, active) VALUES (?, ?, ?, 1)',
      )
        .bind(localPart, env.CATCHALL_DESTINATION, 'catch-all 自動建立')
        .run();
      await message.forward(env.CATCHALL_DESTINATION);
      await log(env, Number(res.meta.last_row_id), 'in', from, to, subject, 'forwarded_catchall');
    } catch (err) {
      console.error('catch-all forward failed:', err);
      await log(env, null, 'in', from, to, subject, 'forward_failed');
    }
    return;
  }

  // 4) 未知地址且沒開 catch-all → 退信
  await log(env, null, 'in', from, to, subject, 'no_alias');
  message.setReject('550 5.1.1 No such recipient');
}

/**
 * 進站轉發。
 *   - 有 RESEND_API_KEY：用 Resend 重新投遞到真實信箱，並把 Reply-To 設成該寄件人專屬的
 *     反向別名，使用者一按回覆就會走 M2 回信流程（forward() 無法加 Reply-To，只能 X- header）。
 *   - 沒有 RESEND_API_KEY：退回原生 forward()（M0 行為，完全不動）。
 */
async function forwardInbound(
  message: ForwardableEmailMessage,
  env: Env,
  alias: { id: number; local_part: string; destination: string },
  from: string,
  to: string,
  subject: string,
): Promise<void> {
  // 未接 Resend → 原生轉發（M0）
  if (!env.RESEND_API_KEY) {
    try {
      await message.forward(alias.destination);
      await log(env, alias.id, 'in', from, to, subject, 'forwarded');
    } catch (err) {
      console.error('forward failed:', err);
      await log(env, alias.id, 'in', from, to, subject, 'forward_failed');
      message.setReject('Temporary delivery failure, please retry later');
    }
    return;
  }

  // 接了 Resend → 建立反向別名並以其為 Reply-To 重新投遞
  try {
    const token = await getOrCreateReverseAlias(env, alias.id, from);
    const parsed = await PostalMime.parse(message.raw, { attachmentEncoding: 'base64' });
    const senderName = parsed.from?.name?.trim() || parsed.from?.address || from;

    await sendViaResend(env, {
      // 顯示原寄件人名稱，但實際寄件地址是「別名@網域」，回覆導向反向別名
      from: `${sanitizeName(senderName)} <${alias.local_part}@${env.MAIL_DOMAIN}>`,
      to: alias.destination,
      replyTo: `${token}@${env.MAIL_DOMAIN}`,
      subject,
      text: parsed.text,
      html: parsed.html,
      attachments: mapAttachments(parsed.attachments),
    });
    await log(env, alias.id, 'in', from, to, subject, 'forwarded');
  } catch (err) {
    console.error('inbound resend failed:', err);
    await log(env, alias.id, 'in', from, to, subject, 'forward_failed');
    message.setReject('Temporary delivery failure, please retry later');
  }
}

/**
 * 出站回信：使用者把信寄到反向別名，代表要回覆對應的外部對象。
 * 需通過：反向別名存在 → 擁有者驗證 → 每日限流 → 以「別名@網域」代寄。
 */
async function handleReply(
  message: ForwardableEmailMessage,
  env: Env,
  token: string,
  from: string,
  to: string,
  subject: string,
): Promise<void> {
  const rev = await env.DB.prepare(
    `SELECT rev.external_addr AS external_addr,
            a.id            AS alias_id,
            a.local_part    AS local_part,
            a.destination   AS destination
       FROM reverse_aliases rev
       JOIN aliases a ON a.id = rev.alias_id
      WHERE rev.token = ?`,
  )
    .bind(token)
    .first<{ external_addr: string; alias_id: number; local_part: string; destination: string }>();

  // 查無反向別名 → 退信
  if (!rev) {
    await log(env, null, 'out', from, to, subject, 'reply_no_reverse');
    message.setReject('550 5.1.1 No such recipient');
    return;
  }

  // 擁有者驗證：寄件人（信封 from 或 From 標頭）須為該別名的真實信箱，防止他人盜用反向別名當跳板
  const headerFrom = extractAddr(message.headers.get('from'));
  const dest = rev.destination.toLowerCase();
  const authorized = from.toLowerCase() === dest || headerFrom === dest;
  if (!authorized) {
    console.warn(`reverse alias ${token}: unauthorized sender ${from}`);
    await log(env, rev.alias_id, 'out', from, to, subject, 'reply_rejected_owner');
    message.setReject('550 5.7.1 Not authorized to use this address');
    return;
  }

  // 每日出站限流
  const limit = Number(env.OUTBOUND_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT;
  const sentToday = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM messages
      WHERE alias_id = ? AND direction = 'out' AND status = 'sent'
        AND received_at > datetime('now', '-1 day')`,
  )
    .bind(rev.alias_id)
    .first<{ n: number }>();
  if ((sentToday?.n ?? 0) >= limit) {
    await log(env, rev.alias_id, 'out', from, to, subject, 'reply_rejected_ratelimit');
    message.setReject('451 4.7.0 Daily sending limit reached, try again later');
    return;
  }

  // 代寄給外部對象。From 用別名地址，Reply-To 也設別名地址，讓對方之後的回覆繼續走進站流程。
  try {
    const parsed = await PostalMime.parse(message.raw, { attachmentEncoding: 'base64' });
    const aliasAddr = `${rev.local_part}@${env.MAIL_DOMAIN}`;
    await sendViaResend(env, {
      from: aliasAddr,
      to: rev.external_addr,
      replyTo: aliasAddr,
      subject,
      text: parsed.text,
      html: parsed.html,
      attachments: mapAttachments(parsed.attachments),
    });
    await log(env, rev.alias_id, 'out', aliasAddr, rev.external_addr, subject, 'sent');
  } catch (err) {
    console.error('outbound resend failed:', err);
    await log(env, rev.alias_id, 'out', from, rev.external_addr, subject, 'send_failed');
    message.setReject('Temporary delivery failure, please retry later');
  }
}

// 取得（或建立）某別名對某外部對象的反向別名 token
async function getOrCreateReverseAlias(
  env: Env,
  aliasId: number,
  external: string,
): Promise<string> {
  const ext = external.toLowerCase();
  const existing = await env.DB.prepare(
    'SELECT token FROM reverse_aliases WHERE alias_id = ? AND external_addr = ?',
  )
    .bind(aliasId, ext)
    .first<{ token: string }>();
  if (existing) return existing.token;

  const token = genToken();
  try {
    await env.DB.prepare(
      'INSERT INTO reverse_aliases (token, alias_id, external_addr) VALUES (?, ?, ?)',
    )
      .bind(token, aliasId, ext)
      .run();
    return token;
  } catch (err) {
    // 併發或 UNIQUE 衝突 → 重讀一次
    const again = await env.DB.prepare(
      'SELECT token FROM reverse_aliases WHERE alias_id = ? AND external_addr = ?',
    )
      .bind(aliasId, ext)
      .first<{ token: string }>();
    if (again) return again.token;
    throw err;
  }
}

function genToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return 'rp' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// 把 postal-mime 附件轉成 Resend 附件格式（content 已是 base64）
function mapAttachments(attachments: Awaited<ReturnType<typeof PostalMime.parse>>['attachments']): ResendAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  const out: ResendAttachment[] = [];
  for (const a of attachments) {
    if (typeof a.content !== 'string') continue; // 以 base64 解析，理應為字串
    out.push({
      filename: a.filename || 'attachment',
      content: a.content,
      content_type: a.mimeType,
      content_id: a.contentId ? a.contentId.replace(/^<|>$/g, '') : undefined,
    });
  }
  return out.length ? out : undefined;
}

// 從 From 標頭取出純 email（去掉顯示名稱與角括號），小寫
function extractAddr(headerVal: string | null): string {
  if (!headerVal) return '';
  const angled = headerVal.match(/<([^>]+)>/);
  const raw = angled ? angled[1] : headerVal;
  return raw.trim().toLowerCase();
}

// 清掉可能破壞 From 標頭的字元（引號、角括號、換行）
function sanitizeName(name: string): string {
  return name.replace(/["<>\r\n]/g, '').trim() || 'someone';
}

async function log(
  env: Env,
  aliasId: number | null,
  direction: 'in' | 'out',
  from: string,
  to: string,
  subject: string,
  status: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO messages (alias_id, direction, from_addr, to_addr, subject, status) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(aliasId, direction, from, to, subject, status)
    .run();
}
