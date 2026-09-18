# opt-mail — 自有網域的一次性信箱

用你自己的網域（DNS 在 Cloudflare）做一次性信箱。目前完成 **M0 收信轉發 + M1 別名管理 + M2 一次性地址回信 + M3 AI 加值**：

- `*@你的網域` 進來的信，由 Cloudflare Email Worker 依規則**轉發**到你的真實信箱
- Dashboard 可建立 / 停用 / 刪除別名、查看轉發與回信紀錄
- **回信**：接上 Resend 後，你在信箱直接按「回覆」就會用**一次性地址**代寄給對方，真實信箱不外洩（reverse alias）
- **AI 加值**：接上 Anthropic API 後，進站信自動做**一句話摘要 / 分類 / 釣魚偵測**，結果顯示在 Dashboard
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
              ├─ email()  進站信
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

# 5. 設定 Dashboard 登入帳密（機密）
npx wrangler secret put DASHBOARD_USER
npx wrangler secret put DASHBOARD_PASS

# 6. 把 wrangler.toml 裡的 MAIL_DOMAIN 改成你的網域

# 7. 部署
npm run deploy
```

## 設定 Cloudflare Email Routing（在網頁後台）

1. Cloudflare Dashboard → 選你的網域 → **Email → Email Routing → 啟用**
   （會自動幫你加 MX 與 SPF 記錄）
2. **Destination addresses**：新增並驗證你的真實信箱（例如 `you@gmail.com`）。
   ⚠️ 別名的「轉發到」只能填**已驗證**的地址，否則 `forward()` 會失敗。
3. **Routes → Catch-all address**：Action 選 **Send to a Worker → `opt-mail`**。
   （這樣所有 `*@你的網域` 的信都會進到 Worker 由程式決定怎麼處理）

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

1. 開 `https://opt-mail.<你的>.workers.dev`（用剛設定的帳密登入）
2. 新增別名，例如 `shopee` → 轉發到 `you@gmail.com`
3. 註冊網站時就填 `shopee@你的網域`
4. 哪天 `shopee@...` 開始收到垃圾信 → 到 Dashboard **停用**它，之後那個地址的信會被靜默丟棄，`被打` 次數會累加（代表資料被賣了）

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
| `MAIL_DOMAIN` | 你的網域；Dashboard 顯示完整地址，也是回信（M2）的出站寄件網域（需在 Resend 驗證） |
| `CATCHALL_MODE` | `off`＝只有建過的別名會轉發，其他退信（建議）；`on`＝任何地址第一次被寄到就自動建立並轉發 |
| `CATCHALL_DESTINATION` | `CATCHALL_MODE=on` 時，未知地址自動轉發到這（需已驗證） |
| `OUTBOUND_DAILY_LIMIT` | M2 回信每個別名每日出站上限，預設 `50` |
| `RESEND_API_KEY`（機密） | M2 回信用的 Resend API key；有設定才啟用回信 |
| `AI_MODEL` | M3 進站信分析用模型，預設 `claude-opus-5`（省錢可設 `claude-haiku-4-5`） |
| `ANTHROPIC_API_KEY`（機密） | M3 AI 分析用的 Anthropic API key；有設定才啟用分析 |

## 路線圖

- [x] **M0** 收信轉發
- [x] **M1** 別名管理 Dashboard
- [x] **M2** 用一次性地址回信（reverse alias + Resend + 擁有者驗證 + 出站限流）
- [x] **M3** AI 加值（進站信摘要 / 釣魚偵測 / 自動分類，Claude + 結構化輸出）
- [ ] **M4** 多使用者、多網域
