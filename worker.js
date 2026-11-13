/* StoreBD Backend Worker for Puter */
const ADMIN_KEY = '__ADMIN_KEY__';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  let body = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      return J({ error: 'bad_json' }, 400);
    }
  }

  if (path === '/ping' || path === '/') {
    return J({ ok: true, message: 'StoreBD Worker is running' });
  }

  if (path === '/settings') {
    const s = await puter.kv.get('settings');
    return J(s ? JSON.parse(s) : { platformName: 'StoreBD', freeLimit: 15, signups: true });
  }

  if (path === '/register') {
    if (!body.slug || !body.ownerKey || !body.store) {
      return J({ error: 'bad_request' }, 400);
    }
    const existing = await puter.kv.get('reg:' + body.slug);
    if (existing) {
      return J({ error: 'taken' }, 409);
    }
    const meta = {
      slug: body.slug,
      name: body.store.name,
      mode: body.store.mode,
      wa: body.store.wa,
      tier: 'free',
      status: 'active',
      ownerKey: body.ownerKey,
      createdAt: Date.now()
    };
    await puter.kv.set('reg:' + body.slug, JSON.stringify(meta));
    await puter.kv.set('snap:' + body.slug, JSON.stringify(body.store));
    return J({ ok: true });
  }

  if (path === '/store') {
    const slug = url.searchParams.get('slug');
    const metaStr = await puter.kv.get('reg:' + slug);
    if (!metaStr) return J({ error: 'not_found' }, 404);
    const meta = JSON.parse(metaStr);
    if (meta.status === 'suspended') return J({ suspended: true, name: meta.name });
    const storeStr = await puter.kv.get('snap:' + slug);
    return J({ store: { ...JSON.parse(storeStr), tier: meta.tier } });
  }

  if (path === '/order') {
    const metaStr = await puter.kv.get('reg:' + body.slug);
    if (!metaStr) return J({ error: 'not_found' }, 404);
    const orderKey = `order:${body.slug}:${Date.now()}`;
    await puter.kv.set(orderKey, JSON.stringify(body.order));
    return J({ ok: true });
  }

  return J({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request);
    } catch (err) {
      return J({ error: 'server', detail: err.message }, 500);
    }
  }
};
