..DEF, ...(await get('settings') || {}) });
const RESERVED = ['registry', 'admin', 'home', 'dashboard', 'super-admin', 'api'];
const slugOk = s => typeof s === 'string' && /^[a-z0-9-]{3,30}$/.test(s) && !RESERVED.includes(s);
const str = (v, n) => String(v ?? '').slice(0, n);
const admin = b => ADMIN_KEY !== '__ADMIN_KEY__' && b.adminKey === ADMIN_KEY;
const orderKey = (slug, ts, id) => `order:${slug}:${String(Math.floor(+ts) || 0).padStart(14, '0')}:${String(id).replace(/[^A-Za-z0-9]/g, '')}`;

function clean(s) {
  const c = { ...s };
  delete c.ownerKey; delete c.status; delete c.tier;
  return JSON.parse(JSON.stringify(c).slice(0, 380000));
}
async function owner(b) {
  const meta = await get('reg:' + b.slug);
  if (!meta) return [null, J({ error: 'not_found' }, 404)];
  if (!b.ownerKey || b.ownerKey !== meta.ownerKey) return [null, J({ error: 'forbidden' }, 403)];
  return [meta, null];
}

const R = {
  '/ping': async () => J({ ok: true }),
  '/settings': async () => J(await settings()),
  '/store': async (b, u) => {
    const slug = u.searchParams.get('slug'), meta = await get('reg:' + slug);
    if (!meta) return J({ error: 'not_found' }, 404);
    const set_ = await settings();
    if (meta.status === 'suspended') return J({ suspended: true, name: meta.name, settings: set_ });
    const snap = await get('snap:' + slug);
    return J({ store: { ...snap, tier: meta.tier }, settings: set_ });
  },
  '/view': async b => {
    if (!slugOk(b.slug) || !(await get('reg:' + b.slug))) return J({ error: 'not_found' }, 404);
    await me.puter.kv.incr('views:' + b.slug, 1);
    return J({ ok: true });
  },
  '/order': async b => {
    const meta = await get('reg:' + b.slug), o = b.order || {};
    if (!meta) return J({ error: 'not_found' }, 404);
    if (meta.status === 'suspended') return J({ error: 'suspended' }, 403);
    if (!o.id || !Array.isArray(o.lines) || o.lines.length > 40) return J({ error: 'bad_order' }, 400);
    const c = {
      id: str(o.id, 20).replace(/[^A-Za-z0-9]/g, ''), type: ['order', 'booking', 'inquiry'].includes(o.type) ? o.type : 'order',
      ts: Date.now(), total: Math.max(0, +o.total || 0), status: 'Pending',
      customer: { name: str(o.customer && o.customer.name, 80), phone: str(o.customer && o.customer.phone, 30) },
      lines: o.lines.map(l => str(l, 300))
    };
    await set(orderKey(b.slug, c.ts, c.id), c);
    return J({ ok: true, ts: c.ts });
  },
  '/register': async b => {
    const s = await settings();
    if (!s.signups) return J({ error: 'signups_closed' }, 403);
    if (!slugOk(b.slug)) return J({ error: 'bad_slug' }, 400);
    if (!b.ownerKey || String(b.ownerKey).length < 16 || !b.store) return J({ error: 'bad_request' }, 400);
    if (await get('reg:' + b.slug)) return J({ error: 'taken' }, 409);
    const st = clean(b.store);
    await set('reg:' + b.slug, { slug: b.slug, name: str(st.name, 80), mode: st.mode, wa: str(st.wa, 20), tier: 'free', status: 'active', ownerKey: b.ownerKey, owner: str(b.owner, 80), createdAt: Date.now() });
    await set('snap:' + b.slug, { ...st, slug: b.slug });
    return J({ ok: true });
  },
  '/m-get': async b => {
    const [meta, err] = await owner(b); if (err) return err;
    return J({ store: await get('snap:' + b.slug), tier: meta.tier, status: meta.status, settings: await settings() });
  },
  '/m-sync': async b => {
    const [meta, err] = await owner(b); if (err) return err;
    if (!b.store) return J({ error: 'bad_request' }, 400);
    const st = clean(b.store);
    await set('snap:' + b.slug, { ...st, slug: b.slug });
    await set('reg:' + b.slug, { ...meta, name: str(st.name, 80), mode: st.mode, wa: str(st.wa, 20) });
    return J({ ok: true });
  },
  '/m-orders': async b => {
    const [, err] = await owner(b); if (err) return err;
    const rows = (await list(`order:${b.slug}:*`)).map(x => x.value).filter(Boolean).sort((x, y) => y.ts - x.ts);
    return J({ orders: rows, views: +(await get('views:' + b.slug)) || 0 });
  },
  '/m-status': async b => {
    const [, err] = await owner(b); if (err) return err;
    if (!['Pending', 'Confirmed', 'Completed', 'Cancelled'].includes(b.status)) return J({ error: 'bad_status' }, 400);
    const k = orderKey(b.slug, b.ts, b.id), o = await get(k);
    if (!o) return J({ error: 'not_found' }, 404);
    await set(k, { ...o, status: b.status });
    return J({ ok: true });
  },
  '/a-check': async b => admin(b) ? J({ ok: true }) : J({ error: 'forbidden' }, 403),
  '/a-stores': async b => {
    if (!admin(b)) return J({ error: 'forbidden' }, 403);
    const metas = (await list('reg:*')).map(x => x.value).filter(Boolean);
    const stat = {};
    (await list('order:*')).forEach(x => {
      const o = x.value, slug = String(x.key).split(':')[1];
      if (!o || !slug) return;
      const t = stat[slug] = stat[slug] || { orders: 0, revenue: 0 };
      t.orders++; if (o.status !== 'Cancelled') t.revenue += o.total || 0;
    });
    const views = {};
    (await list('views:*')).forEach(x => { views[String(x.key).slice(6)] = +x.value || 0; });
    const stores = metas.map(({ ownerKey, ...m }) => ({ ...m, orders: (stat[m.slug] || {}).orders || 0, revenue: (stat[m.slug] || {}).revenue || 0, views: views[m.slug] || 0 }));
    return J({ stores, settings: await settings() });
  },
  '/a-update': async b => {
    if (!admin(b)) return J({ error: 'forbidden' }, 403);
    const meta = await get('reg:' + b.slug), snap = await get('snap:' + b.slug), p = b.patch || {};
    if (!meta) return J({ error: 'not_found' }, 404);
    if (['free', 'pro'].includes(p.tier)) meta.tier = p.tier;
    if (['active', 'suspended'].includes(p.status)) meta.status = p.status;
    const sn = { ...snap };
    ['name', 'tagline', 'wa', 'currency', 'color'].forEach(f => { if (p[f] != null) sn[f] = str(p[f], f === 'tagline' ? 160 : 80); });
    if (['grid', 'list', 'editorial'].includes(p.template)) sn.template = p.template;
    if (p.domain != null) { const d = String(p.domain).toLowerCase().trim(); if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) sn.domain = d; }
    meta.name = sn.name || meta.name; meta.wa = sn.wa || meta.wa;
    await set('reg:' + b.slug, meta); await set('snap:' + b.slug, sn);
    return J({ ok: true });
  },
  '/a-delete': async b => {
    if (!admin(b)) return J({ error: 'forbidden' }, 403);
    const ks = [`reg:${b.slug}`, `snap:${b.slug}`, `views:${b.slug}`, ...(await keys(`order:${b.slug}:*`))];
    for (const k of ks) await me.puter.kv.del(k);
    return J({ ok: true });
  },
  '/a-settings': async b => {
    if (!admin(b)) return J({ error: 'forbidden' }, 403);
    const s = b.settings || {};
    const next = {
      platformName: str(s.platformName || DEF.platformName, 40),
      banner: { on: !!(s.banner && s.banner.on), text: str(s.banner && s.banner.text, 240) },
      freeLimit: Math.max(1, Math.min(10000, +s.freeLimit || DEF.freeLimit)),
      proLimit: Math.max(0, Math.min(100000, +s.proLimit || 0)),
      signups: s.signups !== false
    };
    await set('settings', next);
    return J({ ok: true, settings: next });
  }
};

async function handle({ request }) {
  const u = new URL(request.url), p = u.pathname.replace(/\/+$/, '') || '/';
  let b = {};
  if (request.method === 'POST') { try { b = await request.json(); } catch { return J({ error: 'bad_json' }, 400); } }
  const f = R[p];
  if (!f) return J({ error: 'not_found' }, 404);
  try { return await f(b || {}, u); } catch (e) { return J({ error: 'server', detail: String(e && e.message || e) }, 500); }
}
router.options('/*', () => new Response(null, { status: 204, headers: CORS }));
router.get('/*', handle);
router.post('/*', handle);
