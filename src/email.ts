import type { Env } from './types';

/**
 * Cloudflare Email Routing 進站處理。
 * 只做「收信轉發」(M0)：查 alias → 轉發 / 丟棄 / 退信，並記錄一筆 log。
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

  const alias = await env.DB.prepare('SELECT id, destination, active FROM aliases WHERE local_part = ?')
    .bind(localPart)
    .first<{ id: number; destination: string; active: number }>();

  // 1) 已知且啟用 → 轉發到真實信箱
  if (alias && alias.active) {
    try {
      await message.forward(alias.destination);
      await log(env, alias.id, from, to, subject, 'forwarded');
    } catch (err) {
      // forward 失敗最常見原因：destination 尚未在 Email Routing 驗證
      console.error('forward failed:', err);
      await log(env, alias.id, from, to, subject, 'forward_failed');
      message.setReject('Temporary delivery failure, please retry later');
    }
    return;
  }

  // 2) 已知但已停用 → 靜默收下丟棄（不退信，避免洩漏地址存在與 backscatter），但記次數
  if (alias && !alias.active) {
    await env.DB.prepare('UPDATE aliases SET spam_count = spam_count + 1 WHERE id = ?')
      .bind(alias.id)
      .run();
    await log(env, alias.id, from, to, subject, 'dropped_disabled');
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
      await log(env, Number(res.meta.last_row_id), from, to, subject, 'forwarded_catchall');
    } catch (err) {
      console.error('catch-all forward failed:', err);
      await log(env, null, from, to, subject, 'forward_failed');
    }
    return;
  }

  // 4) 未知地址且沒開 catch-all → 退信
  await log(env, null, from, to, subject, 'no_alias');
  message.setReject('550 5.1.1 No such recipient');
}

async function log(
  env: Env,
  aliasId: number | null,
  from: string,
  to: string,
  subject: string,
  status: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO messages (alias_id, direction, from_addr, to_addr, subject, status) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(aliasId, 'in', from, to, subject, status)
    .run();
}
