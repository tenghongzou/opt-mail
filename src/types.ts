export interface Env {
  DB: D1Database;
  // Dashboard 登入（用 wrangler secret put 設定）
  DASHBOARD_USER: string;
  DASHBOARD_PASS: string;
  // 顯示用網域
  MAIL_DOMAIN: string;
  // catch-all 模式
  CATCHALL_MODE: string;
  CATCHALL_DESTINATION?: string;
}

export interface Alias {
  id: number;
  local_part: string;
  destination: string;
  note: string | null;
  active: number;
  spam_count: number;
  created_at: string;
}
