/* StoreBD Backend Worker for Puter */
const ADMIN_KEY = '__ADMIN_KEY__';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

const J = (o, s = 200) => new Response(JSON.stringify(o), { 
  status: s, 
  headers: { ...CORS, 'Content-Type': 'application/json' } 
});

puter.handlers.all(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;

    let body = {};
    if (request.method === 'POST') {
      try {
        body = await request.json();
      } catch {
        body = {};
      }
    }

    if (path === '/ping' || path === '/') {
      return J({ ok: true, message: 'StoreBD Worker is running' });
    }

    if (path === '/settings') {
      let s = null;
      try { s = await puter.kv.get('settings'); } catch {}
      return J(s ? (typeof s === 'string' ? JSON.parse(s) : s) : { platformName: 'StoreBD', freeLimit: 15, signups: true });
    }

    if (path === '/a-check') {
      if (body.adminKey === ADMIN_KEY) return J({ ok: true });
      return J({ error: 'forbidden' }, 403);
    }

    if (path === '/register') {
      if (!body.slug || !body.ownerKey || !body.store) {
        return J({ error: 'bad_request' }, 400);
      }
      let existing = null;
      try { existing = await puter.kv.get('reg:' + body.slug); } catch {}
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
      let metaStr = null;
      try { metaStr = await puter.kv.get('reg:' + slug); } catch {}
      if (!metaStr) return J({ error: 'not_found' }, 404);
      const meta = typeof metaStr === 'string' ? JSON.parse(metaStr) : metaStr;
      if (meta.status === 'suspended') return J({ suspended: true, name: meta.name });
      let storeStr = null;
      try { storeStr = await puter.kv.get('snap:' + slug); } catch {}
      const storeObj = typeof storeStr === 'string' ? JSON.parse(storeStr) : storeStr;
      return J({ store: { ...storeObj, tier: meta.tier } });
    }

    if (path === '/order') {
      let metaStr = null;
      try { metaStr = await puter.kv.get('reg:' + body.slug); } catch {}
      if (!metaStr) return J({ error: 'not_found' }, 404);
      const orderKey = `order:${body.slug}:${Date.now()}`;
      await puter.kv.set(orderKey, JSON.stringify(body.order));
      return J({ ok: true });
    }

    return J({ error: 'not_found' }, 404);
  } catch (err) {
    return J({ error: 'server', detail: err.message }, 500);
  }
});
