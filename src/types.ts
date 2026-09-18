export interface Env {
  DB: D1Database;
  // 首次啟動用的 bootstrap 管理員帳密（用 wrangler secret put 設定）。
  // 第一次登入時若 users 表為空，用這組帳密建立第一個管理員。
  DASHBOARD_USER: string;
  DASHBOARD_PASS: string;
  // 簽 session cookie 的密鑰（機密）。未設定時退回用 DASHBOARD_PASS（建議正式環境務必另設）。
  SESSION_SECRET?: string;
  // 選用：首次啟動建立第一個管理員時，順便把這個網域建進 domains（方便從舊版遷移）。
  MAIL_DOMAIN?: string;
  // ── M2 回信 ──────────────────────────────────────────────
  RESEND_API_KEY?: string;
  OUTBOUND_DAILY_LIMIT?: string;
  // ── M3 AI 加值 ────────────────────────────────────────────
  ANTHROPIC_API_KEY?: string;
  AI_MODEL?: string;
}

export interface User {
  id: number;
  username: string;
  is_admin: number;
  created_at?: string;
}

export interface Domain {
  id: number;
  domain: string;
  user_id: number;
  catchall_destination: string | null;
  created_at: string;
}

export interface Alias {
  id: number;
  domain_id: number;
  user_id: number;
  local_part: string;
  destination: string;
  note: string | null;
  active: number;
  spam_count: number;
  created_at: string;
}

// 反向別名：某個別名 × 某個外部通訊對象 的專屬回信地址
export interface ReverseAlias {
  id: number;
  token: string; // 本體 local_part，例如 "rp<18碼hex>"
  alias_id: number;
  external_addr: string; // 原始外部寄件人
  created_at: string;
}
