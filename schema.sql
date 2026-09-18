-- 一次性信箱 · 資料表 (M0 + M1 + M2 + M3 + M4)

-- 使用者（M4 多使用者）
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,           -- 登入帳號
  password_hash TEXT    NOT NULL,                  -- pbkdf2$iter$salt$hash
  is_admin      INTEGER NOT NULL DEFAULT 0,        -- 1 = 管理員（可管理使用者）
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 網域（M4 多網域）。每個網域屬於一個使用者。
CREATE TABLE IF NOT EXISTS domains (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  domain               TEXT    NOT NULL UNIQUE,    -- 例如 "example.com"
  user_id              INTEGER NOT NULL,           -- 擁有者
  catchall_destination TEXT,                       -- 設了就等於此網域開啟 catch-all（未知地址自動轉發到這）
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_domains_user ON domains(user_id);

-- 別名（一次性地址本體）。同一網域內 local_part 唯一。
CREATE TABLE IF NOT EXISTS aliases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id   INTEGER NOT NULL,                    -- 所屬網域
  user_id     INTEGER NOT NULL,                    -- 擁有者（= domain 的 user，冗餘以利查詢）
  local_part  TEXT    NOT NULL,                    -- @ 前面那段，例如 "shopee"
  destination TEXT    NOT NULL,                    -- 轉發到哪個真實信箱（需先在 Email Routing 驗證）
  note        TEXT,                                -- 備註：用在哪個網站 / 用途
  active      INTEGER NOT NULL DEFAULT 1,          -- 1 = 啟用；0 = 停用（停用後靜默丟棄）
  spam_count  INTEGER NOT NULL DEFAULT 0,          -- 停用後仍被寄信的次數（判斷是否被賣了）
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (domain_id, local_part),
  FOREIGN KEY (domain_id) REFERENCES domains(id),
  FOREIGN KEY (user_id)   REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_aliases_user   ON aliases(user_id);
CREATE INDEX IF NOT EXISTS idx_aliases_domain ON aliases(domain_id);

-- 進站/出站信件紀錄（給 Dashboard 檢視、給 AI 分析用）
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,                             -- 所屬使用者（未知網域則 NULL）
  domain_id   INTEGER,                             -- 所屬網域（未知網域則 NULL）
  alias_id    INTEGER,                             -- 對應的 alias（未知地址則為 NULL）
  direction   TEXT    NOT NULL DEFAULT 'in',       -- in / out
  from_addr   TEXT,
  to_addr     TEXT,
  subject     TEXT,
  status      TEXT,                                -- forwarded / dropped_disabled / no_alias / forwarded_catchall / forward_failed / sent / send_failed / reply_* / unknown_domain
  received_at TEXT    NOT NULL DEFAULT (datetime('now')),
  -- M3 AI 分析（背景回寫，可能為 NULL）
  summary        TEXT,
  category       TEXT,
  phishing_score INTEGER,
  ai_model       TEXT,
  FOREIGN KEY (alias_id) REFERENCES aliases(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_user  ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_alias ON messages(alias_id);
CREATE INDEX IF NOT EXISTS idx_messages_time  ON messages(received_at);

-- 反向別名（M2 回信用）。token 全域唯一，透過 alias 對應到網域/使用者。
CREATE TABLE IF NOT EXISTS reverse_aliases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token         TEXT    NOT NULL UNIQUE,           -- 地址本體，例如 "rp<18碼hex>"
  alias_id      INTEGER NOT NULL,                  -- 屬於哪個別名
  external_addr TEXT    NOT NULL,                  -- 原始外部寄件人（小寫正規化）
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (alias_id, external_addr),
  FOREIGN KEY (alias_id) REFERENCES aliases(id)
);

CREATE INDEX IF NOT EXISTS idx_reverse_token ON reverse_aliases(token);
