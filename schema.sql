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
