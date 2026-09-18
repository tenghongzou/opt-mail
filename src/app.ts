import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env, User } from './types';
import { dashboardHtml } from './dashboard';
import { hashPassword, verifyPassword, signSession, verifySession, SESSION_TTL } from './auth';

type AppEnv = { Bindings: Env; Variables: { user: User } };
export const app = new Hono<AppEnv>();

const REVERSE_RE = /^rp[0-9a-f]{18}$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// ── Dashboard 頁面（不需登入，資料都在需驗證的 API 後面）──────────
app.get('/', (c) => c.html(dashboardHtml));

// ── 驗證中介層（/api/login 之外全部需登入）─────────────────────
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/login') return next();
  const sess = await verifySession(c.env, getCookie(c, 'session'));
  if (!sess) return c.json({ error: 'unauthenticated' }, 401);
  const user = await c.env.DB.prepare('SELECT id, username, is_admin FROM users WHERE id = ?')
    .bind(sess.uid)
    .first<User>();
  if (!user) return c.json({ error: 'unauthenticated' }, 401);
  c.set('user', user);
  await next();
});

// ── 登入（中介層對 /api/login 放行）───────────────────────────
app.post('/api/login', async (c) => {
  const { username, password } = await c.req.json<{ username?: string; password?: string }>();
  const u = (username ?? '').trim();
  const p = password ?? '';
  if (!u || !p) return c.json({ error: '請輸入帳號與密碼' }, 400);

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();

  // 首次啟動：users 為空時，用 bootstrap 帳密建立第一個管理員
  if ((count?.n ?? 0) === 0) {
    if (u !== c.env.DASHBOARD_USER || p !== c.env.DASHBOARD_PASS) {
      return c.json({ error: '尚未初始化,請用設定的 DASHBOARD_USER / DASHBOARD_PASS 首次登入' }, 401);
    }
    const hash = await hashPassword(p);
    const res = await c.env.DB.prepare(
      'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)',
    )
      .bind(u, hash)
      .run();
    const uid = Number(res.meta.last_row_id);
    await maybeSeedDomain(c.env, uid);
    await issueSession(c, uid);
    return c.json({ ok: true });
  }

  const user = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE username = ?')
    .bind(u)
    .first<{ id: number; password_hash: string }>();
  if (!user || !(await verifyPassword(p, user.password_hash))) {
    return c.json({ error: '帳號或密碼錯誤' }, 401);
  }
  await issueSession(c, user.id);
  return c.json({ ok: true });
});

app.post('/api/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ ok: true });
});

app.get('/api/me', (c) => {
  const me = c.get('user');
  return c.json({ id: me.id, username: me.username, is_admin: me.is_admin });
});

app.post('/api/me/password', async (c) => {
  const me = c.get('user');
  const { current, next } = await c.req.json<{ current?: string; next?: string }>();
  if (!next || next.length < 6) return c.json({ error: '新密碼至少 6 碼' }, 400);
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
    .bind(me.id)
    .first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(current ?? '', row.password_hash))) {
    return c.json({ error: '目前密碼錯誤' }, 401);
  }
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(await hashPassword(next), me.id)
    .run();
  return c.json({ ok: true });
});

app.get('/api/config', (c) =>
  c.json({
    reply: !!c.env.RESEND_API_KEY, // M2 回信是否啟用
    ai: !!c.env.ANTHROPIC_API_KEY, // M3 AI 分析是否啟用
  }),
);

// ── 網域（M4）────────────────────────────────────────────────
app.get('/api/domains', async (c) => {
  const me = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM domains WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(me.id)
    .all();
  return c.json(results);
});

app.post('/api/domains', async (c) => {
  const me = c.get('user');
  const body = await c.req.json<{ domain?: string; catchall_destination?: string }>();
  const domain = (body.domain ?? '').trim().toLowerCase();
  const catchall = (body.catchall_destination ?? '').trim() || null;
  if (!DOMAIN_RE.test(domain)) return c.json({ error: '網域格式不正確' }, 400);
  try {
    const res = await c.env.DB.prepare(
      'INSERT INTO domains (domain, user_id, catchall_destination) VALUES (?, ?, ?)',
    )
      .bind(domain, me.id, catchall)
      .run();
    return c.json({ id: res.meta.last_row_id }, 201);
  } catch (err) {
    if (String(err).includes('UNIQUE')) return c.json({ error: '這個網域已被使用' }, 409);
    return c.json({ error: String(err) }, 500);
  }
});

app.patch('/api/domains/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ catchall_destination?: string | null }>();
  const owned = await c.env.DB.prepare('SELECT id FROM domains WHERE id = ? AND user_id = ?')
    .bind(id, me.id)
    .first();
  if (!owned) return c.json({ error: '找不到網域' }, 404);
  const catchall = (body.catchall_destination ?? '').trim() || null;
  await c.env.DB.prepare('UPDATE domains SET catchall_destination = ? WHERE id = ?')
    .bind(catchall, id)
    .run();
  return c.json({ ok: true });
});

app.delete('/api/domains/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const owned = await c.env.DB.prepare('SELECT id FROM domains WHERE id = ? AND user_id = ?')
    .bind(id, me.id)
    .first();
  if (!owned) return c.json({ error: '找不到網域' }, 404);
  const used = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM aliases WHERE domain_id = ?')
    .bind(id)
    .first<{ n: number }>();
  if ((used?.n ?? 0) > 0) return c.json({ error: '請先刪除此網域下的所有別名' }, 409);
  await c.env.DB.prepare('DELETE FROM domains WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ── 別名（M1，改為依網域 + 使用者隔離）──────────────────────────
app.get('/api/aliases', async (c) => {
  const me = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, d.domain FROM aliases a
       JOIN domains d ON d.id = a.domain_id
      WHERE a.user_id = ? ORDER BY a.created_at DESC`,
  )
    .bind(me.id)
    .all();
  return c.json(results);
});

app.post('/api/aliases', async (c) => {
  const me = c.get('user');
  const body = await c.req.json<{
    domain_id?: number;
    local_part?: string;
    destination?: string;
    note?: string;
  }>();
  const local = (body.local_part ?? '').trim().toLowerCase();
  const dest = (body.destination ?? '').trim();
  if (!body.domain_id || !local || !dest) {
    return c.json({ error: '網域、local_part 與 destination 為必填' }, 400);
  }
  if (!/^[a-z0-9._+-]+$/.test(local)) return c.json({ error: 'local_part 含不合法字元' }, 400);
  if (REVERSE_RE.test(local)) return c.json({ error: '此格式保留給系統回信使用' }, 400);
  const domain = await c.env.DB.prepare('SELECT id FROM domains WHERE id = ? AND user_id = ?')
    .bind(body.domain_id, me.id)
    .first();
  if (!domain) return c.json({ error: '找不到網域' }, 404);
  try {
    const res = await c.env.DB.prepare(
      'INSERT INTO aliases (domain_id, user_id, local_part, destination, note, active) VALUES (?, ?, ?, ?, ?, 1)',
    )
      .bind(body.domain_id, me.id, local, dest, body.note ?? null)
      .run();
    return c.json({ id: res.meta.last_row_id }, 201);
  } catch (err) {
    if (String(err).includes('UNIQUE')) return c.json({ error: '這個地址已存在' }, 409);
    return c.json({ error: String(err) }, 500);
  }
});

app.patch('/api/aliases/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json<{ active?: boolean; note?: string; destination?: string }>();
  const owned = await c.env.DB.prepare('SELECT id FROM aliases WHERE id = ? AND user_id = ?')
    .bind(id, me.id)
    .first();
  if (!owned) return c.json({ error: '找不到別名' }, 404);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.active !== undefined) {
    sets.push('active = ?');
    vals.push(body.active ? 1 : 0);
  }
  if (body.note !== undefined) {
    sets.push('note = ?');
    vals.push(body.note);
  }
  if (body.destination !== undefined) {
    sets.push('destination = ?');
    vals.push(body.destination);
  }
  if (sets.length === 0) return c.json({ error: '沒有要更新的欄位' }, 400);
  vals.push(id);
  await c.env.DB.prepare(`UPDATE aliases SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run();
  return c.json({ ok: true });
});

app.delete('/api/aliases/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const owned = await c.env.DB.prepare('SELECT id FROM aliases WHERE id = ? AND user_id = ?')
    .bind(id, me.id)
    .first();
  if (!owned) return c.json({ error: '找不到別名' }, 404);
  await c.env.DB.prepare('DELETE FROM reverse_aliases WHERE alias_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM messages WHERE alias_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM aliases WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ── 反向別名清單（M2）────────────────────────────────────────
app.get('/api/reverse-aliases', async (c) => {
  const me = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT rev.id, rev.token, rev.external_addr, rev.created_at, a.local_part, d.domain
       FROM reverse_aliases rev
       JOIN aliases a ON a.id = rev.alias_id
       JOIN domains d ON d.id = a.domain_id
      WHERE a.user_id = ?
      ORDER BY rev.created_at DESC LIMIT 200`,
  )
    .bind(me.id)
    .all();
  return c.json(results);
});

// ── 信件紀錄（依使用者隔離；可用 ?alias_id= 過濾）─────────────────
app.get('/api/messages', async (c) => {
  const me = c.get('user');
  const aliasId = c.req.query('alias_id');
  const stmt = aliasId
    ? c.env.DB.prepare(
        'SELECT * FROM messages WHERE user_id = ? AND alias_id = ? ORDER BY received_at DESC LIMIT 100',
      ).bind(me.id, aliasId)
    : c.env.DB.prepare(
        'SELECT * FROM messages WHERE user_id = ? ORDER BY received_at DESC LIMIT 100',
      ).bind(me.id);
  const { results } = await stmt.all();
  return c.json(results);
});

// ── 使用者管理（僅管理員）─────────────────────────────────────
app.get('/api/users', async (c) => {
  const me = c.get('user');
  if (!me.is_admin) return c.json({ error: '需要管理員權限' }, 403);
  const { results } = await c.env.DB.prepare(
    'SELECT id, username, is_admin, created_at FROM users ORDER BY id',
  ).all();
  return c.json(results);
});

app.post('/api/users', async (c) => {
  const me = c.get('user');
  if (!me.is_admin) return c.json({ error: '需要管理員權限' }, 403);
  const body = await c.req.json<{ username?: string; password?: string; is_admin?: boolean }>();
  const u = (body.username ?? '').trim();
  const p = body.password ?? '';
  if (!u || p.length < 6) return c.json({ error: '帳號必填、密碼至少 6 碼' }, 400);
  try {
    const res = await c.env.DB.prepare(
      'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)',
    )
      .bind(u, await hashPassword(p), body.is_admin ? 1 : 0)
      .run();
    return c.json({ id: res.meta.last_row_id }, 201);
  } catch (err) {
    if (String(err).includes('UNIQUE')) return c.json({ error: '帳號已存在' }, 409);
    return c.json({ error: String(err) }, 500);
  }
});

app.delete('/api/users/:id', async (c) => {
  const me = c.get('user');
  if (!me.is_admin) return c.json({ error: '需要管理員權限' }, 403);
  const id = Number(c.req.param('id'));
  if (id === me.id) return c.json({ error: '不能刪除自己' }, 400);
  const owns = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM domains WHERE user_id = ?')
    .bind(id)
    .first<{ n: number }>();
  if ((owns?.n ?? 0) > 0) return c.json({ error: '該使用者仍擁有網域，請先移轉或刪除' }, 409);
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ── 內部工具 ─────────────────────────────────────────────────
async function issueSession(c: Context<AppEnv>, uid: number): Promise<void> {
  const token = await signSession(c.env, uid);
  setCookie(c, 'session', token, {
    httpOnly: true,
    secure: c.req.url.startsWith('https://'),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL,
  });
}

// 首次啟動時，若設了 MAIL_DOMAIN（且非預設 example.com）就自動建成第一個網域
async function maybeSeedDomain(env: Env, uid: number): Promise<void> {
  const domain = (env.MAIL_DOMAIN ?? '').trim().toLowerCase();
  if (!domain || domain === 'example.com' || !DOMAIN_RE.test(domain)) return;
  try {
    await env.DB.prepare('INSERT INTO domains (domain, user_id) VALUES (?, ?)')
      .bind(domain, uid)
      .run();
  } catch {
    /* 已存在就略過 */
  }
}
