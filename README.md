# opt-mail — 自有網域的一次性信箱

用你自己的網域（DNS 在 Cloudflare）做一次性信箱。目前完成 **M0 收信轉發 + M1 別名管理**：

- `*@你的網域` 進來的信，由 Cloudflare Email Worker 依規則**轉發**到你的真實信箱
- Dashboard 可建立 / 停用 / 刪除別名、查看轉發紀錄
- 資料存在 Cloudflare D1（SQLite）

> 回信（用一次性地址寄信給對方）是之後的 **M2**，會接 Resend。這階段還用不到。

---

## 架構

```
外部寄件人 → Cloudflare Email Routing (catch-all)
                     │
                     ▼
             opt-mail Worker
              ├─ email()  進站信 → 查 D1 → forward / 丟棄 / 退信 + 記 log
              └─ fetch()  Dashboard / API（Hono）
                     │
                     ▼
                 D1 (aliases, messages)
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
| `MAIL_DOMAIN` | 你的網域，僅供 Dashboard 顯示完整地址 |
| `CATCHALL_MODE` | `off`＝只有建過的別名會轉發，其他退信（建議）；`on`＝任何地址第一次被寄到就自動建立並轉發 |
| `CATCHALL_DESTINATION` | `CATCHALL_MODE=on` 時，未知地址自動轉發到這（需已驗證） |

## 路線圖

- [x] **M0** 收信轉發
- [x] **M1** 別名管理 Dashboard
- [ ] **M2** 用一次性地址回信（reverse alias + Resend + 擁有者驗證 + 出站限流）
- [ ] **M3** AI 加值（進站信摘要 / 釣魚偵測 / 自動分類）
- [ ] **M4** 多使用者、多網域
