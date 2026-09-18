# opt-mail — 自有網域的一次性信箱

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Claude](https://img.shields.io/badge/AI-Claude-D97757?logo=anthropic&logoColor=white)](https://www.anthropic.com/)

用你自己的網域（DNS 在 Cloudflare）做一次性信箱。目前完成 **M0～M4**：

- **M0 收信轉發**：`*@你的網域` 進來的信，由 Cloudflare Email Worker 依規則**轉發**到你的真實信箱
- **M1 別名管理**：Dashboard 可建立 / 停用 / 刪除別名、查看轉發與回信紀錄
- **M2 回信**：接上 Resend 後，你在信箱直接按「回覆」就會用**一次性地址**代寄給對方，真實信箱不外洩（reverse alias）
- **M3 AI 加值**：接上 Anthropic API 後，進站信自動做**一句話摘要 / 分類 / 釣魚偵測**
- **M4 多使用者、多網域**：登入制（session cookie + PBKDF2 密碼雜湊），每位使用者的網域／別名／信件互相隔離；
  可管理多個網域，catch-all 改為**每個網域各自**設定；管理員可新增使用者
- 資料存在 Cloudflare D1（SQLite）

> M2 回信與 M3 AI 都是**選用**的：分別由 `RESEND_API_KEY` / `ANTHROPIC_API_KEY` 有沒有設定決定是否啟用；
> 都沒設定時，進站信就是最單純的 M0 原生 `forward()` 轉發。

---

## 架構

```
外部寄件人 ──→ Cloudflare Email Routing (catch-all)
                     │
                     ▼
             opt-mail Worker
              ├─ email()  進站信（依「收件網域 + local_part」查別名）
              │    ├─ 一般別名 → 查 D1 → 轉發到真實信箱
              │    │             （接了 Resend：改用 Resend 重送並把 Reply-To
              │    │               設成反向別名，讓你一按回覆就能匿名回信）
              │    │             （接了 Anthropic：ctx.waitUntil 背景做
              │    │               摘要／分類／釣魚偵測，回寫該筆紀錄）
              │    └─ 反向別名 → 這是你的回信 → 擁有者驗證 + 每日限流
              │                  → 以「別名@網域」用 Resend 代寄給外部對象
              └─ fetch()  Dashboard / API（Hono）
                     │
                     ▼
          D1 (aliases, messages, reverse_aliases) ──→ Resend（出站）／ Claude（分析）
```

---

## 安裝與部署

```bash
# 1. 安裝相依套件
npm install

# 2. 登入 Cloudflare
npx wrangler login

# 3. 建立 D1 資料庫，把回傳的 database_id 貼進 wrangler.toml
npx wrangler d1 create opt-mail-db

# 4. 建立資料表（遠端 + 本機各跑一次）
npm run db:init
npm run db:init:local

# 5. 設定首次登入用的 bootstrap 管理員帳密 + session 密鑰（機密）
npx wrangler secret put DASHBOARD_USER    # 第一次登入用；登入後即建立第一個管理員
npx wrangler secret put DASHBOARD_PASS
npx wrangler secret put SESSION_SECRET     # 隨機長字串，用來簽 session cookie

# 6.（選用）把 wrangler.toml 的 MAIL_DOMAIN 設成你的網域 →
#    首次登入時會自動建成第一個網域；之後網域都在 Dashboard 管理

# 7. 部署
npm run deploy
```

> 首次登入：開 Dashboard → 用上面設定的 `DASHBOARD_USER` / `DASHBOARD_PASS` 登入，
> 系統會建立第一個**管理員**。之後可在 Dashboard 改密碼、新增其他使用者與網域。

## 設定 Cloudflare Email Routing（在網頁後台）

1. Cloudflare Dashboard → 選你的網域 → **Email → Email Routing → 啟用**
   （會自動幫你加 MX 與 SPF 記錄）
2. **Destination addresses**：新增並驗證你的真實信箱（例如 `you@gmail.com`）。
   ⚠️ 別名的「轉發到」只能填**已驗證**的地址，否則 `forward()` 會失敗。
3. **Routes → Catch-all address**：Action 選 **Send to a Worker → `opt-mail`**。
   （這樣所有 `*@你的網域` 的信都會進到 Worker 由程式決定怎麼處理）
4. 每個要用的網域都各自做一次上面的設定，並在 Dashboard「網域」新增它。
   未在 Dashboard 建立的網域，進站信會直接退信（`unknown_domain`）。

> **多網域 / catch-all**：M4 起 catch-all 不再是全域開關，而是**每個網域各自**設定——
> 在 Dashboard 的網域列填「catch-all 轉發到」就等於為該網域開啟 catch-all（未知地址自動建立並轉發到那）。

## 設定回信（M2，選用）

回信要把信「從你的網域寄出去」，Cloudflare 原生 `forward()` / `send_email` 只能寄到已驗證地址，
無法寄給任意外部對象，所以出站改用 **Resend**：

1. 註冊 [Resend](https://resend.com) → **Domains** 新增並驗證你的 `MAIL_DOMAIN`
   （照它給的 DKIM/SPF/DMARC 記錄加到 Cloudflare DNS）。
2. 取得 API key，設成機密：`npx wrangler secret put RESEND_API_KEY`。
3. 重新部署。之後：
   - 別人寄到 `shopee@你的網域` → 你信箱收到的信 **Reply-To 會是一個反向別名**。
   - 你直接**按回覆**打字送出 → Worker 驗證是你本人（寄件人＝該別名的 destination）、
     未超出每日上限後，用 `shopee@你的網域` 代寄給對方，對方看不到你的真實信箱。
   - 出站上限由 `OUTBOUND_DAILY_LIMIT` 控制（預設 50／別名／天）。

> 沒設定 `RESEND_API_KEY` 就不會啟用回信，進站信仍用原生 `forward()` 轉發。

## 設定 AI 加值（M3，選用）

進站信自動摘要、分類與釣魚偵測，交給 Claude 處理：

1. 到 [Anthropic Console](https://console.anthropic.com) 取得 API key，設成機密：
   `npx wrangler secret put ANTHROPIC_API_KEY`。
2. （選用）在 `wrangler.toml` 設 `AI_MODEL`。**預設 `claude-opus-5`**（最高品質）；
   想大幅省成本可改 `claude-haiku-4-5`。
3. 重新部署。之後每封成功轉發的進站信，會在**背景**（`ctx.waitUntil`，不拖慢收信）
   呼叫 Claude 產出摘要／分類／釣魚風險分數，結果回寫並顯示在 Dashboard「最近信件」。

- 分析在信件**投遞完成後**才跑，AI 失敗或逾時都不影響收信轉發。
- 釣魚風險 ≥ 70 會在 Dashboard 標示「⚠️ 疑似釣魚」，40–69 標示「可疑」。
- 內文過長會截斷到約 8000 字以控制成本。

> 沒設定 `ANTHROPIC_API_KEY` 就完全不會呼叫 Claude，也不產生任何費用。

## 使用

1. 開 `https://opt-mail.<你的>.workers.dev` → 用管理員帳密**登入**
2. 到「網域」新增你的網域（若已用 `MAIL_DOMAIN` 種子過就已存在）
3. 新增別名：選網域 + `shopee` → 轉發到 `you@gmail.com`
4. 註冊網站時就填 `shopee@你的網域`
5. 哪天 `shopee@...` 開始收到垃圾信 → 到 Dashboard **停用**它，之後那個地址的信會被靜默丟棄，`被打` 次數會累加（代表資料被賣了）
6. （管理員）可在「使用者管理」新增其他使用者；每個人的網域／別名／信件彼此隔離

## 本機開發

```bash
cp .dev.vars.example .dev.vars   # 填入本機用的帳密
npm run dev                      # http://localhost:8787
```

> 注意：`wrangler dev` 無法真正收外部 email；進站信邏輯要用 `wrangler dev --remote` 或部署後實測。Dashboard/API 本機即可開發。

---

## 設定說明（wrangler.toml `[vars]`）

| 變數 | 說明 |
|------|------|
| `DASHBOARD_USER`（機密） | 首次登入用的 bootstrap 管理員帳號（登入後即建立第一個管理員） |
| `DASHBOARD_PASS`（機密） | 首次登入用的 bootstrap 管理員密碼 |
| `SESSION_SECRET`（機密） | 簽 session cookie 的密鑰；未設會退回用 `DASHBOARD_PASS`（正式環境務必另設） |
| `MAIL_DOMAIN` | 選用：首次建立管理員時自動建成第一個網域（非 `example.com` 才會建）；之後網域都在 Dashboard 管理 |
| `OUTBOUND_DAILY_LIMIT` | M2 回信每個別名每日出站上限，預設 `50` |
| `RESEND_API_KEY`（機密） | M2 回信用的 Resend API key；有設定才啟用回信 |
| `AI_MODEL` | M3 進站信分析用模型，預設 `claude-opus-5`（省錢可設 `claude-haiku-4-5`） |
| `ANTHROPIC_API_KEY`（機密） | M3 AI 分析用的 Anthropic API key；有設定才啟用分析 |

> catch-all 從 M4 起改為**每個網域各自**在 Dashboard 設定（不再用 `CATCHALL_MODE` 全域開關）。

## 路線圖

- [x] **M0** 收信轉發
- [x] **M1** 別名管理 Dashboard
- [x] **M2** 用一次性地址回信（reverse alias + Resend + 擁有者驗證 + 出站限流）
- [x] **M3** AI 加值（進站信摘要 / 釣魚偵測 / 自動分類，Claude + 結構化輸出）
- [x] **M4** 多使用者、多網域（session 登入 + PBKDF2 + per-user 隔離 + per-domain catch-all）
