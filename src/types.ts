export interface Env {
  DB: D1Database;
  // Dashboard 登入（用 wrangler secret put 設定）
  DASHBOARD_USER: string;
  DASHBOARD_PASS: string;
  // 顯示用網域，同時作為出站信件的寄件網域（需在 Resend 驗證）
  MAIL_DOMAIN: string;
  // catch-all 模式
  CATCHALL_MODE: string;
  CATCHALL_DESTINATION?: string;
  // ── M2 回信 ──────────────────────────────────────────────
  // Resend API key（機密，用 wrangler secret put 設定）。
  // 有設定 → 啟用反向別名回信；未設定 → 進站信退回原生 forward()（M0 行為）。
  RESEND_API_KEY?: string;
  // 每個別名每日出站上限（防濫用），字串數字，預設 50
  OUTBOUND_DAILY_LIMIT?: string;
  // ── M3 AI 加值 ────────────────────────────────────────────
  // Anthropic API key（機密）。有設定 → 進站信自動做摘要／分類／釣魚偵測；未設定 → 略過。
  ANTHROPIC_API_KEY?: string;
  // 分析用模型，預設 claude-opus-5；想省錢可設 "claude-haiku-4-5"
  AI_MODEL?: string;
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

// 反向別名：某個別名 × 某個外部通訊對象 的專屬回信地址
export interface ReverseAlias {
  id: number;
  token: string; // 本體 local_part，例如 "rp<18碼hex>"
  alias_id: number;
  external_addr: string; // 原始外部寄件人
  created_at: string;
}
