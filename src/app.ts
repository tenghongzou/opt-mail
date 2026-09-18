import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import type { Env } from './types';
import { dashboardHtml } from './dashboard';

export const app = new Hono<{ Bindings: Env }>();

// 全站基本驗證（帳密來自 secret：DASHBOARD_USER / DASHBOARD_PASS）
app.use('*', (c, next) =>
  basicAuth({
    verifyUser: (username, password, ctx) =>
      username === ctx.env.DASHBOARD_USER && password === ctx.env.DASHBOARD_PASS,
  })(c, next),
);

// Dashboard 頁面
app.get('/', (c) => c.html(dashboardHtml));

// 前端啟動時取設定（顯示用網域、catch-all 狀態）
app.get('/api/config', (c) =>
  c.json({
    domain: c.env.MAIL_DOMAIN,
    catchall: c.env.CATCHALL_MODE === 'on',
    reply: !!c.env.RESEND_API_KEY, // M2 回信是否啟用（有接 Resend）
  }),
);

// 列出所有 alias
app.get('/api/aliases', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM aliases ORDER BY created_at DESC').all();
  return c.json(results);
});

// 新增 alias
app.post('/api/aliases', async (c) => {
  const body = await c.req.json<{ local_part?: string; destination?: string; note?: string }>();
  const local = (body.local_part ?? '').trim().toLowerCase();
  const dest = (body.destination ?? '').trim();
  if (!local || !dest) return c.json({ error: 'local_part 與 destination 為必填' }, 400);
  if (!/^[a-z0-9._+-]+$/.test(local)) return c.json({ error: 'local_part 含不合法字元' }, 400);
  if (/^rp[0-9a-f]{18}$/.test(local)) return c.json({ error: '此格式保留給系統回信使用' }, 400);
  try {
    const res = await c.env.DB.prepare(
      'INSERT INTO aliases (local_part, destination, note, active) VALUES (?, ?, ?, 1)',
    )
      .bind(local, dest, body.note ?? null)
      .run();
    return c.json({ id: res.meta.last_row_id }, 201);
  } catch (err) {
    if (String(err).includes('UNIQUE')) return c.json({ error: '這個地址已存在' }, 409);
    return c.json({ error: String(err) }, 500);
  }
});

// 更新 alias（啟用/停用、備註、轉發目的地）
app.patch('/api/aliases/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ active?: boolean; note?: string; destination?: string }>();
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

// 刪除 alias（連同其信件紀錄）
app.delete('/api/aliases/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM messages WHERE alias_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM aliases WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// 反向別名清單（M2 回信對象），附所屬別名的 local_part
app.get('/api/reverse-aliases', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT rev.id, rev.token, rev.alias_id, rev.external_addr, rev.created_at,
            a.local_part
       FROM reverse_aliases rev
       JOIN aliases a ON a.id = rev.alias_id
      ORDER BY rev.created_at DESC
      LIMIT 200`,
  ).all();
  return c.json(results);
});

// 信件紀錄（可用 ?alias_id= 過濾）
app.get('/api/messages', async (c) => {
  const aliasId = c.req.query('alias_id');
  const stmt = aliasId
    ? c.env.DB.prepare(
        'SELECT * FROM messages WHERE alias_id = ? ORDER BY received_at DESC LIMIT 100',
      ).bind(aliasId)
    : c.env.DB.prepare('SELECT * FROM messages ORDER BY received_at DESC LIMIT 100');
  const { results } = await stmt.all();
  return c.json(results);
});
