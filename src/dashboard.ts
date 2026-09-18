export const dashboardHtml = /* html */ `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>一次性信箱</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #fff; --fg: #1a1c20; --muted: #6b7280;
    --border: #e5e7eb; --accent: #2563eb; --danger: #dc2626; --ok: #16a34a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a; --card: #1c1f26; --fg: #e6e8eb; --muted: #9aa2ad;
      --border: #2b2f38; --accent: #5b8cff; --danger: #f27272; --ok: #4ade80;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg);
    font: 14px/1.5 -apple-system, "Noto Sans TC", system-ui, sans-serif; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; }
  .card { background: var(--card); border: 1px solid var(--border);
    border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  label { display: block; font-size: 12px; color: var(--muted); margin: 8px 0 4px; }
  input, button { font: inherit; }
  input[type=text], input[type=email] { width: 100%; padding: 8px 10px;
    border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--fg); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; }
  .row > div { flex: 1; min-width: 160px; }
  button { cursor: pointer; border: 1px solid var(--border); background: var(--card);
    color: var(--fg); padding: 8px 12px; border-radius: 8px; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button.link { border: none; background: none; color: var(--accent); padding: 4px; }
  button.danger { color: var(--danger); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border);
    vertical-align: top; }
  th { font-size: 12px; color: var(--muted); font-weight: 600; }
  .addr { font-family: ui-monospace, monospace; }
  .pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; display: inline-block; }
  .pill.on { background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); }
  .pill.off { background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--danger); }
  .muted { color: var(--muted); }
  .msg { padding: 8px; font-size: 13px; }
  .empty { color: var(--muted); padding: 24px; text-align: center; }
  .overflow { overflow-x: auto; }
</style>
</head>
<body>
<div class="wrap">
  <h1>一次性信箱</h1>
  <p class="sub" id="domainLine">載入中…</p>

  <div class="card">
    <div class="row">
      <div>
        <label>地址（@ 前面）</label>
        <input id="local" type="text" placeholder="shopee" autocomplete="off" />
      </div>
      <div>
        <label>轉發到（需先在 Email Routing 驗證）</label>
        <input id="dest" type="email" placeholder="you@gmail.com" autocomplete="off" />
      </div>
      <div style="flex:2">
        <label>備註</label>
        <input id="note" type="text" placeholder="用途，例如：蝦皮註冊" autocomplete="off" />
      </div>
      <div style="flex:0 0 auto; min-width:auto">
        <label>&nbsp;</label>
        <button class="link" id="genBtn" type="button">🎲 隨機</button>
        <button class="primary" id="addBtn" type="button">新增</button>
      </div>
    </div>
    <p class="muted" id="addMsg" style="margin:8px 0 0"></p>
  </div>

  <div class="card overflow">
    <table>
      <thead>
        <tr><th>地址</th><th>轉發到</th><th>備註</th><th>狀態</th><th>被打</th><th></th></tr>
      </thead>
      <tbody id="rows"><tr><td colspan="6" class="empty">載入中…</td></tr></tbody>
    </table>
  </div>

  <div class="card">
    <h1 style="font-size:15px;margin-bottom:8px">最近進站信件</h1>
    <div class="overflow"><table>
      <thead><tr><th>時間</th><th>寄件人</th><th>收件地址</th><th>主旨</th><th>結果</th></tr></thead>
      <tbody id="logs"><tr><td colspan="5" class="empty">載入中…</td></tr></tbody>
    </table></div>
  </div>
</div>

<script>
let DOMAIN = '';
const $ = (id) => document.getElementById(id);
const esc = (s) => (s ?? '').toString().replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

async function api(path, opts) {
  const r = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

async function boot() {
  const cfg = await api('/api/config');
  DOMAIN = cfg.domain;
  $('domainLine').textContent = '網域 @' + DOMAIN + (cfg.catchall ? '（catch-all 已開啟）' : '（僅限已建立的地址）');
  await Promise.all([loadAliases(), loadLogs()]);
}

async function loadAliases() {
  const list = await api('/api/aliases');
  const tb = $('rows');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">還沒有任何地址，先新增一個吧</td></tr>'; return; }
  tb.innerHTML = list.map((a) => \`
    <tr>
      <td class="addr">\${esc(a.local_part)}@\${esc(DOMAIN)}</td>
      <td class="muted">\${esc(a.destination)}</td>
      <td>\${esc(a.note) || '<span class="muted">—</span>'}</td>
      <td><span class="pill \${a.active ? 'on' : 'off'}">\${a.active ? '啟用' : '停用'}</span></td>
      <td>\${a.spam_count || 0}</td>
      <td style="white-space:nowrap">
        <button class="link" onclick="toggle(\${a.id}, \${a.active ? 0 : 1})">\${a.active ? '停用' : '啟用'}</button>
        <button class="link danger" onclick="del(\${a.id})">刪除</button>
      </td>
    </tr>\`).join('');
}

async function loadLogs() {
  const list = await api('/api/messages');
  const tb = $('logs');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="5" class="empty">尚無信件</td></tr>'; return; }
  const label = { forwarded: '✅ 已轉發', forwarded_catchall: '✅ 轉發(catch-all)',
    dropped_disabled: '🗑️ 已停用丟棄', no_alias: '⛔ 無此地址', forward_failed: '⚠️ 轉發失敗' };
  tb.innerHTML = list.map((m) => \`
    <tr>
      <td class="muted" style="white-space:nowrap">\${esc(m.received_at)}</td>
      <td>\${esc(m.from_addr)}</td>
      <td class="addr">\${esc(m.to_addr)}</td>
      <td>\${esc(m.subject)}</td>
      <td style="white-space:nowrap">\${label[m.status] || esc(m.status)}</td>
    </tr>\`).join('');
}

async function add() {
  $('addMsg').textContent = '';
  try {
    await api('/api/aliases', { method: 'POST', body: JSON.stringify({
      local_part: $('local').value, destination: $('dest').value, note: $('note').value }) });
    $('local').value = ''; $('note').value = '';
    await loadAliases();
  } catch (e) { $('addMsg').textContent = '❌ ' + e.message; }
}

async function toggle(id, active) { await api('/api/aliases/' + id, { method: 'PATCH', body: JSON.stringify({ active: !!active }) }); await loadAliases(); }
async function del(id) { await api('/api/aliases/' + id, { method: 'DELETE' }); await loadAliases(); }

function randomLocal() {
  const w = ['sky','fox','ink','pine','wave','moss','clay','dawn','reed','fern','jade','onyx'];
  return w[Math.random()*w.length|0] + '-' + w[Math.random()*w.length|0] + '-' + (Math.random()*9000+1000|0);
}

$('addBtn').onclick = add;
$('genBtn').onclick = () => { $('local').value = randomLocal(); };
window.toggle = toggle; window.del = del;
boot().catch((e) => { $('domainLine').textContent = '載入失敗：' + e.message; });
</script>
</body>
</html>`;
