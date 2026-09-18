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
  input, button, select { font: inherit; }
  input[type=text], input[type=email], input[type=password], select { width: 100%; padding: 8px 10px;
    border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--fg); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; }
  .row > div { flex: 1; min-width: 150px; }
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
  .pill.warn { background: color-mix(in srgb, #f59e0b 20%, transparent); color: #b45309; }
  .pill.cat { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); }
  .muted { color: var(--muted); }
  .empty { color: var(--muted); padding: 24px; text-align: center; }
  .overflow { overflow-x: auto; }
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .sect { font-size: 15px; margin: 0 0 8px; }
  .grow { flex: 2; }
</style>
</head>
<body>
<div class="wrap">

  <!-- 登入 -->
  <div id="loginView" style="display:none">
    <h1>一次性信箱</h1>
    <p class="sub">請登入</p>
    <div class="card" style="max-width:360px">
      <label>帳號</label>
      <input id="loginUser" type="text" autocomplete="username" />
      <label>密碼</label>
      <input id="loginPass" type="password" autocomplete="current-password" />
      <div style="margin-top:12px"><button class="primary" id="loginBtn" type="button" style="width:100%">登入</button></div>
      <p class="muted" id="loginMsg" style="margin:8px 0 0"></p>
    </div>
  </div>

  <!-- 主畫面 -->
  <div id="appView" style="display:none">
    <div class="topbar">
      <div><h1 style="display:inline">一次性信箱</h1> <span class="muted" id="whoami"></span></div>
      <div style="white-space:nowrap">
        <button class="link" id="pwdBtn" type="button">改密碼</button>
        <button class="link" id="logoutBtn" type="button">登出</button>
      </div>
    </div>
    <p class="sub" id="statusLine"></p>

    <!-- 網域 -->
    <div class="card">
      <h2 class="sect">網域</h2>
      <div class="row">
        <div><label>網域</label><input id="domName" type="text" placeholder="example.com" autocomplete="off" /></div>
        <div class="grow"><label>catch-all 轉發到（選填；填了此網域未知地址自動轉發到這，需已驗證）</label>
          <input id="domCatch" type="email" placeholder="you@gmail.com" autocomplete="off" /></div>
        <div style="flex:0 0 auto; min-width:auto"><label>&nbsp;</label><button class="primary" id="addDomBtn" type="button">新增網域</button></div>
      </div>
      <p class="muted" id="domMsg" style="margin:8px 0 0"></p>
      <div class="overflow" style="margin-top:12px"><table>
        <thead><tr><th>網域</th><th>catch-all</th><th>建立時間</th><th></th></tr></thead>
        <tbody id="domRows"><tr><td colspan="4" class="empty">載入中…</td></tr></tbody>
      </table></div>
    </div>

    <!-- 新增別名 -->
    <div class="card">
      <h2 class="sect">新增別名</h2>
      <div class="row">
        <div style="flex:0 0 auto"><label>網域</label><select id="aliasDomain"></select></div>
        <div><label>地址（@ 前面）</label><input id="local" type="text" placeholder="shopee" autocomplete="off" /></div>
        <div><label>轉發到（需先在 Email Routing 驗證）</label><input id="dest" type="email" placeholder="you@gmail.com" autocomplete="off" /></div>
        <div class="grow"><label>備註</label><input id="note" type="text" placeholder="用途，例如：蝦皮註冊" autocomplete="off" /></div>
        <div style="flex:0 0 auto; min-width:auto"><label>&nbsp;</label>
          <button class="link" id="genBtn" type="button">🎲 隨機</button>
          <button class="primary" id="addBtn" type="button">新增</button></div>
      </div>
      <p class="muted" id="addMsg" style="margin:8px 0 0"></p>
    </div>

    <div class="card overflow">
      <table>
        <thead><tr><th>地址</th><th>轉發到</th><th>備註</th><th>狀態</th><th>被打</th><th></th></tr></thead>
        <tbody id="rows"><tr><td colspan="6" class="empty">載入中…</td></tr></tbody>
      </table>
    </div>

    <div class="card" id="reverseCard" style="display:none">
      <h2 class="sect">回信對象（反向別名）</h2>
      <p class="muted" style="margin:0 0 8px">別人寄信進來後，你的信箱按「回覆」就會用對應的一次性地址代寄，真實信箱不外洩。</p>
      <div class="overflow"><table>
        <thead><tr><th>你的別名</th><th>通訊對象</th><th>反向地址（回覆時系統自動使用）</th><th>建立時間</th></tr></thead>
        <tbody id="reverse"><tr><td colspan="4" class="empty">載入中…</td></tr></tbody>
      </table></div>
    </div>

    <div class="card">
      <h2 class="sect">最近信件</h2>
      <div class="overflow"><table>
        <thead><tr><th>時間</th><th></th><th>寄件人</th><th>收件地址</th><th>主旨</th><th>結果</th></tr></thead>
        <tbody id="logs"><tr><td colspan="6" class="empty">載入中…</td></tr></tbody>
      </table></div>
    </div>

    <!-- 使用者管理（管理員）-->
    <div class="card" id="usersCard" style="display:none">
      <h2 class="sect">使用者管理</h2>
      <div class="row">
        <div><label>帳號</label><input id="uName" type="text" autocomplete="off" /></div>
        <div><label>密碼（至少 6 碼）</label><input id="uPass" type="password" autocomplete="new-password" /></div>
        <div style="flex:0 0 auto"><label>&nbsp;</label><label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--fg)"><input type="checkbox" id="uAdmin" style="width:auto" />管理員</label></div>
        <div style="flex:0 0 auto; min-width:auto"><label>&nbsp;</label><button class="primary" id="addUserBtn" type="button">新增使用者</button></div>
      </div>
      <p class="muted" id="userMsg" style="margin:8px 0 0"></p>
      <div class="overflow" style="margin-top:12px"><table>
        <thead><tr><th>ID</th><th>帳號</th><th>角色</th><th>建立時間</th><th></th></tr></thead>
        <tbody id="userRows"><tr><td colspan="5" class="empty">載入中…</td></tr></tbody>
      </table></div>
    </div>
  </div>
</div>

<script>
let ME = null, DOMAINS = [];
const $ = (id) => document.getElementById(id);
const esc = (s) => (s ?? '').toString().replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

async function api(path, opts) {
  const r = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts });
  if (r.status === 401 && ME) { showLogin(); throw new Error('請重新登入'); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}

function showLogin() { ME = null; $('appView').style.display = 'none'; $('loginView').style.display = ''; }

async function boot() {
  try {
    ME = await api('/api/me');
  } catch { showLogin(); return; }
  $('loginView').style.display = 'none';
  $('appView').style.display = '';
  $('whoami').textContent = '· ' + ME.username + (ME.is_admin ? '（管理員）' : '');
  $('usersCard').style.display = ME.is_admin ? '' : 'none';

  const cfg = await api('/api/config');
  const flags = [cfg.reply ? '✉️ 回信已啟用' : '回信未啟用', cfg.ai ? '🤖 AI 分析已啟用' : 'AI 分析未啟用'];
  $('statusLine').textContent = flags.join('、');
  const tasks = [loadDomains(), loadAliases(), loadLogs()];
  if (cfg.reply) { $('reverseCard').style.display = ''; tasks.push(loadReverse()); }
  if (ME.is_admin) tasks.push(loadUsers());
  await Promise.all(tasks);
}

async function login() {
  $('loginMsg').textContent = '';
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ username: $('loginUser').value, password: $('loginPass').value }) });
    $('loginPass').value = '';
    await boot();
  } catch (e) { $('loginMsg').textContent = '❌ ' + e.message; }
}

async function logout() { await api('/api/logout', { method: 'POST' }).catch(() => {}); showLogin(); }

async function loadDomains() {
  DOMAINS = await api('/api/domains');
  const sel = $('aliasDomain');
  sel.innerHTML = DOMAINS.map((d) => '<option value="' + d.id + '">@' + esc(d.domain) + '</option>').join('') || '<option value="">（先新增網域）</option>';
  const tb = $('domRows');
  if (!DOMAINS.length) { tb.innerHTML = '<tr><td colspan="4" class="empty">還沒有網域，先新增一個（需在 Cloudflare Email Routing 指向本 Worker）</td></tr>'; return; }
  tb.innerHTML = DOMAINS.map((d) => \`
    <tr>
      <td class="addr">@\${esc(d.domain)}</td>
      <td>\${d.catchall_destination ? esc(d.catchall_destination) : '<span class="muted">關閉</span>'}</td>
      <td class="muted" style="white-space:nowrap">\${esc(d.created_at)}</td>
      <td style="white-space:nowrap"><button class="link danger" onclick="delDomain(\${d.id})">刪除</button></td>
    </tr>\`).join('');
}

async function addDomain() {
  $('domMsg').textContent = '';
  try {
    await api('/api/domains', { method: 'POST', body: JSON.stringify({ domain: $('domName').value, catchall_destination: $('domCatch').value }) });
    $('domName').value = ''; $('domCatch').value = '';
    await loadDomains();
  } catch (e) { $('domMsg').textContent = '❌ ' + e.message; }
}
async function delDomain(id) { await api('/api/domains/' + id, { method: 'DELETE' }); await loadDomains(); }

async function loadAliases() {
  const list = await api('/api/aliases');
  const tb = $('rows');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">還沒有任何地址，先新增一個吧</td></tr>'; return; }
  tb.innerHTML = list.map((a) => \`
    <tr>
      <td class="addr">\${esc(a.local_part)}@\${esc(a.domain)}</td>
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

async function add() {
  $('addMsg').textContent = '';
  const domainId = Number($('aliasDomain').value);
  if (!domainId) { $('addMsg').textContent = '❌ 請先新增並選擇網域'; return; }
  try {
    await api('/api/aliases', { method: 'POST', body: JSON.stringify({
      domain_id: domainId, local_part: $('local').value, destination: $('dest').value, note: $('note').value }) });
    $('local').value = ''; $('note').value = '';
    await loadAliases();
  } catch (e) { $('addMsg').textContent = '❌ ' + e.message; }
}
async function toggle(id, active) { await api('/api/aliases/' + id, { method: 'PATCH', body: JSON.stringify({ active: !!active }) }); await loadAliases(); }
async function del(id) { await api('/api/aliases/' + id, { method: 'DELETE' }); await loadAliases(); await loadReverse().catch(() => {}); }

async function loadReverse() {
  const list = await api('/api/reverse-aliases');
  const tb = $('reverse');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="4" class="empty">還沒有回信對象（有人寄信進來後會自動出現）</td></tr>'; return; }
  tb.innerHTML = list.map((r) => \`
    <tr>
      <td class="addr">\${esc(r.local_part)}@\${esc(r.domain)}</td>
      <td>\${esc(r.external_addr)}</td>
      <td class="addr muted">\${esc(r.token)}@\${esc(r.domain)}</td>
      <td class="muted" style="white-space:nowrap">\${esc(r.created_at)}</td>
    </tr>\`).join('');
}

async function loadLogs() {
  const list = await api('/api/messages');
  const tb = $('logs');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">尚無信件</td></tr>'; return; }
  const label = { forwarded: '✅ 已轉發', forwarded_catchall: '✅ 轉發(catch-all)',
    dropped_disabled: '🗑️ 已停用丟棄', no_alias: '⛔ 無此地址', unknown_domain: '⛔ 非本網域',
    forward_failed: '⚠️ 轉發失敗', sent: '✅ 已回信', send_failed: '⚠️ 回信失敗',
    reply_rejected_owner: '🚫 非本人擋下', reply_rejected_ratelimit: '⏳ 超出每日上限', reply_no_reverse: '⛔ 無此反向別名' };
  tb.innerHTML = list.map((m) => \`
    <tr>
      <td class="muted" style="white-space:nowrap">\${esc(m.received_at)}</td>
      <td title="\${m.direction === 'out' ? '出站回信' : '進站'}">\${m.direction === 'out' ? '📤' : '📥'}</td>
      <td>\${esc(m.from_addr)}</td>
      <td class="addr">\${esc(m.to_addr)}</td>
      <td>\${esc(m.subject)}\${aiInfo(m)}</td>
      <td style="white-space:nowrap">\${label[m.status] || esc(m.status)}</td>
    </tr>\`).join('');
}

function aiInfo(m) {
  if (!m.summary && m.phishing_score == null && !m.category) return '';
  const bits = [];
  const score = m.phishing_score;
  if (score != null && score >= 70) bits.push('<span class="pill off">⚠️ 疑似釣魚 ' + score + '</span>');
  else if (score != null && score >= 40) bits.push('<span class="pill warn">可疑 ' + score + '</span>');
  if (m.category) bits.push('<span class="pill cat">' + esc(m.category) + '</span>');
  const tags = bits.length ? '<div style="margin-top:4px">' + bits.join(' ') + '</div>' : '';
  const sum = m.summary ? '<div class="muted" style="margin-top:4px;font-size:12px">🤖 ' + esc(m.summary) + '</div>' : '';
  return tags + sum;
}

async function loadUsers() {
  const list = await api('/api/users');
  const tb = $('userRows');
  tb.innerHTML = list.map((u) => \`
    <tr>
      <td>\${u.id}</td>
      <td>\${esc(u.username)}</td>
      <td>\${u.is_admin ? '<span class="pill cat">管理員</span>' : '<span class="muted">一般</span>'}</td>
      <td class="muted" style="white-space:nowrap">\${esc(u.created_at)}</td>
      <td style="white-space:nowrap">\${u.id === ME.id ? '<span class="muted">（自己）</span>' : '<button class="link danger" onclick="delUser(' + u.id + ')">刪除</button>'}</td>
    </tr>\`).join('');
}

async function addUser() {
  $('userMsg').textContent = '';
  try {
    await api('/api/users', { method: 'POST', body: JSON.stringify({ username: $('uName').value, password: $('uPass').value, is_admin: $('uAdmin').checked }) });
    $('uName').value = ''; $('uPass').value = ''; $('uAdmin').checked = false;
    await loadUsers();
  } catch (e) { $('userMsg').textContent = '❌ ' + e.message; }
}
async function delUser(id) { await api('/api/users/' + id, { method: 'DELETE' }); await loadUsers(); }

async function changePassword() {
  const current = prompt('目前密碼：'); if (current == null) return;
  const next = prompt('新密碼（至少 6 碼）：'); if (next == null) return;
  try { await api('/api/me/password', { method: 'POST', body: JSON.stringify({ current, next }) }); alert('✅ 密碼已更新'); }
  catch (e) { alert('❌ ' + e.message); }
}

function randomLocal() {
  const w = ['sky','fox','ink','pine','wave','moss','clay','dawn','reed','fern','jade','onyx'];
  return w[Math.random()*w.length|0] + '-' + w[Math.random()*w.length|0] + '-' + (Math.random()*9000+1000|0);
}

$('loginBtn').onclick = login;
$('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('logoutBtn').onclick = logout;
$('pwdBtn').onclick = changePassword;
$('addDomBtn').onclick = addDomain;
$('addBtn').onclick = add;
$('genBtn').onclick = () => { $('local').value = randomLocal(); };
$('addUserBtn').onclick = addUser;
window.toggle = toggle; window.del = del; window.delDomain = delDomain; window.delUser = delUser;
boot();
</script>
</body>
</html>`;
