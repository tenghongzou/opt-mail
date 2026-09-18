import type { Env } from './types';

// Resend 附件（content 為 base64 字串）
export interface ResendAttachment {
  filename: string;
  content: string; // base64
  content_type?: string;
  content_id?: string; // 內嵌圖片（cid:）用
}

export interface ResendMail {
  from: string; // "Name <addr@domain>" 或純地址
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  attachments?: ResendAttachment[];
}

/**
 * 透過 Resend HTTP API 寄出一封信。
 * 成功回傳 Resend 的 message id；失敗丟出含狀態碼與訊息的錯誤。
 */
export async function sendViaResend(env: Env, mail: ResendMail): Promise<string> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY 未設定');

  // Resend 要求 text / html 至少一個
  const text = mail.text ?? (mail.html ? undefined : '(空白內容)');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      text,
      html: mail.html,
      reply_to: mail.replyTo,
      attachments: mail.attachments,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${detail || res.statusText}`);
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return data.id ?? '';
}
