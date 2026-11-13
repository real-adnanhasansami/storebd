/* StoreBD API — Cloudflare Pages Function (same origin as the site, so no CORS needed).
   Bindings: DB (D1). Variables: SESSION_SECRET (secret), ADMIN_EMAILS (comma list). */
const enc = new TextEncoder();
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const b64 = u => { let s = ''; u.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
const str = (v, n) => String(v ?? '').slice(0, n);
const RESERVED = ['registry', 'admin', 'home', 'dashboard', 'super-admin', 'api', 'deploy'];
const slugOk = s => typeof s === 'string' && /^[a-z0-9-]{3,30}$/.test(s) && !RESERVED.includes(s);
const DEF = { platformName: 'StoreBD', banner: { on: false, text: '' }, freeLimit: 15, proLimit: 0, signups: true };

async function pbk(pw, salt) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, k, 256)));
}
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const mkToken = async (env, uid) => { const p = uid + '.' + (Date.now() + 30 * 864e5); return p + '.' + await hmac(env.SESSION_SECRET, p); };
async function authUser(env, request) {
  const [uid, exp, sig] = (request.headers.get('Authorization') || '').replace(/^Bearer /, '').split('.');
  if (!uid || !exp || !sig || +exp < Date.now() || sig !== await hmac(env.SESSION_SECRET, uid + '.' + exp)) return null;
  return env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(uid).first();
}
const isAdmin = (env, u) => !!u && String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).includes(u.email);
const getSettings = async db => { const r = await db.prepare("SELECT v FROM settings WHERE k = 'settings'").first(); let s = {}; try { s = JSON.parse(r && r.v); } catch { } return { ...DEF, ...s }; };
function clean(s) {
  const c = { ...s }; delete c.ownerKey; delete c.status; delete c.tier;
  if (!['shop', 'clinic', 'service'].includes(c.mode)) throw Object.assign(new Error('bad_mode'), { code: 'bad_request' });
  if (JSON.stringify(c).length > 400000) throw Object.assign(new Error('too_big'), { code: 'too_big' });
  return c;
}
const E = (code, status = 400) => J({ error: code }, status);
const myStore = (db, u) => db.prepare('SELECT * FROM stores WHERE owner_id = ?').bind(u.id).first();
const ORDER_STATES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
const rowOrder = r => ({ id: r.id, type: r.type, ts: r.ts, total: r.total, status: r.status, customer: { name: r.cname, phone: r.cphone }, lines: JSON.parse(r.lines || '[]') });

const R = {
  '/settings': async ({ db }) => J(await getSettings(db)),

  '/signup': async ({ b, db, env }) => {
    if (!(await getSettings(db)).signups) return E('signups_closed', 403);
    const email = str(b.email, 120).trim().toLowerCase(), pw = String(b.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pw.length < 8 || pw.length > 200) return E('bad_credentials');
    if (await db.prepare('SELECT 1 AS x FROM users WHERE email = ?').bind(email).first()) return E('exists', 409);
    const id = hex(12), salt = crypto.getRandomValues(new Uint8Array(16));
    await db.prepare('INSERT INTO users (id, email, salt, hash, created_at) VALUES (?,?,?,?,?)').bind(id, email, b64(salt), await pbk(pw, salt), Date.now()).run();
    return J({ token: await mkToken(env, id), user: { email, admin: isAdmin(env, { email }) } });
  },

  '/login': async ({ b, db, env }) => {
    const email = str(b.email, 120).trim().toLowerCase(), r = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!r || await pbk(String(b.password || ''), unb64(r.salt)) !== r.hash) return E('bad_login', 401);
    return J({ token: await mkToken(env, r.id), user: { email, admin: isAdmin(env, r) } });
  },

  '/me': async ({ u, env }) => u ? J({ user: { email: u.email, admin: isAdmin(env, u) } }) : E('unauthorized', 401),

  '/mine': async ({ u, db }) => {
    if (!u) return E('unauthorized', 401);
    const s = await myStore(db, u), settings = await getSettings(db);
    if (!s) return J({ store: null, settings });
    const o = await db.prepare('SELECT * FROM orders WHERE slug = ? ORDER BY ts DESC LIMIT 500').bind(s.slug).all();
    const v = await db.prepare('SELECT n FROM views WHERE slug = ?').bind(s.slug).first();
    return J({ store: JSON.parse(s.data), tier: s.tier, status: s.status, orders: o.results.map(rowOrder), views: v ? v.n : 0, settings });
  },

  '/create': async ({ b, u, db }) => {
    if (!u) return E('unauthorized', 401);
    if (!(await getSettings(db)).signups) return E('signups_closed', 403);
    const slug = b.store && b.store.slug;
    if (!slugOk(slug)) return E('bad_slug');
    if (await myStore(db, u)) return E('has_store', 409);
    if (await db.prepare('SELECT 1 AS x FROM stores WHERE slug = ?').bind(slug).first()) return E('taken', 409);
    const st = { ...clean(b.store), slug };
    await db.prepare('INSERT INTO stores (slug, owner_id, name, mode, wa, data, created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(slug, u.id, str(st.name, 80), st.mode, str(st.wa, 20), JSON.stringify(st), Date.now()).run();
    return J({ ok: true });
  },

  '/save': async ({ b, u, db }) => {
    if (!u) return E('unauthorized', 401);
    const s = await myStore(db, u); if (!s) return E('not_found', 404);
    const st = { ...clean(b.store || {}), slug: s.slug }, set = await getSettings(db);
    const lim = s.tier === 'pro' ? set.proLimit : set.freeLimit;
    if (lim && (st.items || []).length > lim) return E('limit', 403);
    await db.prepare('UPDATE stores SET name = ?, mode = ?, wa = ?, data = ? WHERE slug = ?').bind(str(st.name, 80), st.mode, str(st.wa, 20), JSON.stringify(st), s.slug).run();
    return J({ ok: true });
  },

  '/store': async ({ url, db }) => {
    const s = await db.prepare('SELECT * FROM stores WHERE slug = ?').bind(url.searchParams.get('slug') || '').first();
    if (!s) return E('not_found', 404);
    const settings = await getSettings(db);
    if (s.status === 'suspended') return J({ suspended: true, name: s.name, settings });
    return J({ store: { ...JSON.parse(s.data), tier: s.tier }, settings });
  },

  '/view': async ({ b, db }) => {
    if (!slugOk(b.slug)) return E('not_found', 404);
    await db.prepare('INSERT INTO views (slug, n) SELECT slug, 1 FROM stores WHERE slug = ? ON CONFLICT(slug) DO UPDATE SET n = n + 1').bind(b.slug).run();
    return J({ ok: true });
  },

  '/order': async ({ b, db }) => {
    const s = await db.prepare('SELECT status FROM stores WHERE slug = ?').bind(b.slug || '').first(), o = b.order || {};
    if (!s) return E('not_found', 404);
    if (s.status === 'suspended') return E('suspended', 403);
    const id = str(o.id, 20).replace(/[^A-Za-z0-9]/g, '');
    if (!id || !Array.isArray(o.lines) || o.lines.length > 40) return E('bad_order');
    const cu = o.customer || {};
    await db.prepare('INSERT OR IGNORE INTO orders (slug, id, ts, type, total, status, cname, cphone, lines) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(b.slug, id, Date.now(), ['order', 'booking', 'inquiry'].includes(o.type) ? o.type : 'order', Math.max(0, +o.total || 0), 'Pending', str(cu.name, 80), str(cu.phone, 30), JSON.stringify(o.lines.map(l => str(l, 300)))).run();
    return J({ ok: true });
  },

  '/orderstatus': async ({ b, u, db }) => {
    if (!u) return E('unauthorized', 401);
    const s = await myStore(db, u); if (!s) return E('not_found', 404);
    if (!ORDER_STATES.includes(b.status)) return E('bad_status');
    await db.prepare('UPDATE orders SET status = ? WHERE slug = ? AND id = ?').bind(b.status, s.slug, str(b.id, 20)).run();
    return J({ ok: true });
  },

  '/upload': async ({ b, u, db }) => {
    if (!u) return E('unauthorized', 401);
    const s = await myStore(db, u); if (!s) return E('not_found', 404);
    const data = String(b.data || '');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(b.mime) || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 600000) return E('bad_image');
    const n = await db.prepare('SELECT COUNT(*) AS n FROM images WHERE slug = ?').bind(s.slug).first();
    if (n.n >= 150) return E('too_many_images', 403);
    const id = hex(10);
    await db.prepare('INSERT INTO images (id, slug, mime, data, created_at) VALUES (?,?,?,?,?)').bind(id, s.slug, b.mime, data, Date.now()).run();
    return J({ id });
  },

  '/img': async ({ url, db }) => {
    const r = await db.prepare('SELECT mime, data FROM images WHERE id = ?').bind(url.searchParams.get('id') || '').first();
    if (!r) return new Response('not found', { status: 404 });
    return new Response(unb64(r.data), { headers: { 'Content-Type': r.mime, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  },

  '/a-stores': async ({ admin, db }) => {
    if (!admin) return E('forbidden', 403);
    const r = await db.prepare(`SELECT s.slug, s.name, s.mode, s.wa, s.tier, s.status, s.created_at AS createdAt, u.email AS owner,
      (SELECT COUNT(*) FROM orders o WHERE o.slug = s.slug) AS orders,
      (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.slug = s.slug AND o.status != 'Cancelled') AS revenue,
      COALESCE((SELECT n FROM views v WHERE v.slug = s.slug), 0) AS views
      FROM stores s JOIN users u ON u.id = s.owner_id`).all();
    return J({ stores: r.results, settings: await getSettings(db) });
  },

  '/a-update': async ({ b, admin, db }) => {
    if (!admin) return E('forbidden', 403);
    const s = await db.prepare('SELECT * FROM stores WHERE slug = ?').bind(b.slug || '').first(), p = b.patch || {};
    if (!s) return E('not_found', 404);
    const sn = JSON.parse(s.data);
    ['name', 'tagline', 'wa', 'currency', 'color'].forEach(f => { if (p[f] != null) sn[f] = str(p[f], f === 'tagline' ? 160 : 80); });
    if (['grid', 'list', 'editorial'].includes(p.template)) sn.template = p.template;
    if (p.domain != null) { const d = String(p.domain).toLowerCase().trim(); if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) sn.domain = d; }
    await db.prepare('UPDATE stores SET name = ?, wa = ?, tier = ?, status = ?, data = ? WHERE slug = ?')
      .bind(sn.name, sn.wa, ['free', 'pro'].includes(p.tier) ? p.tier : s.tier, ['active', 'suspended'].includes(p.status) ? p.status : s.status, JSON.stringify(sn), s.slug).run();
    return J({ ok: true });
  },

  '/a-delete': async ({ b, admin, db }) => {
    if (!admin) return E('forbidden', 403);
    const slug = str(b.slug, 40);
    await db.batch(['stores', 'orders', 'views', 'images'].map(t => db.prepare(`DELETE FROM ${t} WHERE slug = ?`).bind(slug)));
    return J({ ok: true });
  },

  '/a-settings': async ({ b, admin, db }) => {
    if (!admin) return E('forbidden', 403);
    const s = b.settings || {};
    const next = {
      platformName: str(s.platformName || DEF.platformName, 40), banner: { on: !!(s.banner && s.banner.on), text: str(s.banner && s.banner.text, 240) },
      freeLimit: Math.max(1, Math.min(10000, +s.freeLimit || DEF.freeLimit)), proLimit: Math.max(0, Math.min(100000, +s.proLimit || 0)), signups: s.signups !== false
    };
    await db.prepare("INSERT INTO settings (k, v) VALUES ('settings', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(next)).run();
    return J({ ok: true, settings: next });
  }
};

export async function onRequest({ request, env }) {
  try {
    if (!env.DB) return J({ error: 'config', detail: 'D1 binding "DB" is missing' }, 500);
    if (!env.SESSION_SECRET) return J({ error: 'config', detail: 'SESSION_SECRET is not set' }, 500);
    const url = new URL(request.url), p = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
    const f = R[p];
    if (!f) return E('not_found', 404);
    let b = {};
    if (request.method === 'POST') { try { b = await request.json(); } catch { return E('bad_json'); } }
    const u = await authUser(env, request);
    return await f({ b, url, env, u, db: env.DB, admin: isAdmin(env, u) });
  } catch (e) {
    if (e && e.code) return E(e.code);
    return J({ error: 'server', detail: String((e && e.message) || e) }, 500);
  }
}
