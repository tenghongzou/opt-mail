-- 一次性信箱 · 資料表 (M0 + M1)

-- 別名（一次性地址本體）
CREATE TABLE IF NOT EXISTS aliases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  local_part  TEXT    NOT NULL UNIQUE,          -- @ 前面那段，例如 "shopee"
  destination TEXT    NOT NULL,                 -- 轉發到哪個真實信箱（需先在 Email Routing 驗證）
  note        TEXT,                             -- 備註：用在哪個網站 / 用途
  active      INTEGER NOT NULL DEFAULT 1,       -- 1 = 啟用；0 = 停用（停用後靜默丟棄）
  spam_count  INTEGER NOT NULL DEFAULT 0,       -- 停用後仍被寄信的次數（判斷是否被賣了）
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 進站信件紀錄（給 Dashboard 檢視、之後給 AI 分析用）
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_id    INTEGER,                          -- 對應的 alias（未知地址則為 NULL）
  direction   TEXT    NOT NULL DEFAULT 'in',    -- in / out（out 之後回信階段才會用到）
  from_addr   TEXT,
  to_addr     TEXT,
  subject     TEXT,
  status      TEXT,                             -- forwarded / dropped_disabled / no_alias / forwarded_catchall / forward_failed
  received_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (alias_id) REFERENCES aliases(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_alias ON messages(alias_id);
CREATE INDEX IF NOT EXISTS idx_messages_time  ON messages(received_at);

-- 反向別名（M2 回信用）
-- 每一組 (別名, 外部通訊對象) 對應一個專屬 token 地址；
-- 進站信轉發時把 Reply-To 設成 token@網域，使用者一按回覆就會寄回這裡，
-- 由 Worker 以「別名@網域」的身分代寄給外部對象，藏住真實信箱。
CREATE TABLE IF NOT EXISTS reverse_aliases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token         TEXT    NOT NULL UNIQUE,          -- 地址本體，例如 "rp<18碼hex>"
  alias_id      INTEGER NOT NULL,                 -- 屬於哪個別名
  external_addr TEXT    NOT NULL,                 -- 原始外部寄件人（小寫正規化）
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (alias_id, external_addr),               -- 同一組對象只發一個反向別名
  FOREIGN KEY (alias_id) REFERENCES aliases(id)
);

CREATE INDEX IF NOT EXISTS idx_reverse_token ON reverse_aliases(token);
