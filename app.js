'use strict';
/* StoreBD — WhatsApp Storefront & Booking SaaS. Backend: Puter.js (auth, kv, fs, hosting). */
const CFG = {
  SUPER_ADMINS: ['learn369official@gmail.com', 'spotless_idea_906100'], // Puter email or username (lowercase) allowed into #super-admin
  BASE_URL: 'https://storebd.pages.dev',            // public origin for shareable links and QR codes (a store's own custom domain overrides it)
  WORKER_URL: 'https://storebd.puter.work', // URL printed by deploy.html after deploying worker.js
  RESERVED: ['registry', 'admin', 'home', 'dashboard', 'super-admin']
};
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
const money = (n, c) => (c || '') + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const digits = s => String(s || '').replace(/\D/g, '');
const app = h => { $('#app').innerHTML = h; };
const spinner = '<div class="min-h-screen grid place-items-center mut">Loading…</div>';
const signed = () => { try { return puter.auth.isSignedIn(); } catch { return false; } };
const toast = m => { const t = $('#toast'); t.textContent = m; t.className = 'show'; clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', 2600); };
const newKey = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
const storeLink = st => `${st.domain ? 'https://' + st.domain : CFG.BASE_URL.replace(/\/+$/, '')}/?store=${st.slug}`;
const subURL = s => `https://wsb-${s}.puter.site`;
const fmtDate = iso => new Date(iso + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const isAdmin = u => !!u && CFG.SUPER_ADMINS.some(a => [u.email, u.username].map(x => String(x || '').toLowerCase()).includes(a.toLowerCase()));

const K = {
  get: async k => { try { const v = await puter.kv.get(k); if (v == null) return null; return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } },
  set: (k, v) => puter.kv.set(k, JSON.stringify(v)),
  list: async p => {
    try {
      const r = await puter.kv.list(p, true), a = Array.isArray(r) ? r : (r.items || []);
      return a.map(x => ({ key: x.key, value: typeof x.value === 'string' ? JSON.parse(x.value) : x.value }));
    } catch { return []; }
  }
};
const jsonp = (url, g) => new Promise(res => {
  const s = document.createElement('script');
  s.src = url + '?t=' + Date.now();
  s.onload = () => { res(window[g] || null); delete window[g]; s.remove(); };
  s.onerror = () => { res(null); s.remove(); };
  document.head.appendChild(s);
});

const freshU = () => ({ cat: 'All', cart: {}, cartOpen: false, date: '', shift: 0, mode: 'delivery', form: {}, sel: {} });
let CUR = null, S = { tab: 'overview', pub: '' }, U = freshU(), IMG = {};
const SET = { platformName: 'StoreBD', banner: { on: false, text: '' }, freeLimit: 15, proLimit: 0, signups: true };
const tierOf = () => (S.store && S.store.tier) || 'free';
const limitOf = () => tierOf() === 'pro' ? SET.proLimit : SET.freeLimit;
async function api(path, body) {
  const j = body ? JSON.stringify(body) : '';
  const r = await fetch(CFG.WORKER_URL + path, body ? { method: 'POST', body: j, headers: { 'Content-Type': 'text/plain' }, keepalive: j.length < 60000 } : {});
  let d = {}; try { d = await r.json(); } catch { }
  if (!r.ok) throw Object.assign(new Error(d.error || 'request failed'), { code: d.error });
  return d;
}
const loadSettings = async () => { try { Object.assign(SET, await api('/settings')); } catch { } };
const bannerHTML = () => SET.banner.on && SET.banner.text ? `<div class="notice">${esc(SET.banner.text)}</div>` : '';
const imgSrc = f => !f ? '' : IMG[f] || `${subURL(CUR.slug)}/${f}`;
const vars = it => it.variants && it.variants.length ? it.variants : [{ l: '', p: it.price || 0 }];
const pr = (it, i = 0) => +(vars(it)[i].p * (1 - (it.disc || 0) / 100)).toFixed(2);

/* ---------- demo data ---------- */
const D = o => ({ slug: 'demo', tier: 'pro', tagline: '', logo: '', banner: '', dark: false, doctor: { shifts: [], days: [] }, items: [], ...o });
const DEMOS = {
  shop: D({ mode: 'shop', name: 'Fresh Basket', tagline: 'Groceries at your door in 60 minutes', wa: '8801700000000', currency: '৳', color: '#16a34a', template: 'list', items: [
    { id: 'a', name: 'Basmati Rice', cat: 'Staples', emoji: '🍚', variants: [{ l: '1 kg', p: 140 }, { l: '5 kg', p: 650 }], disc: 8 },
    { id: 'b', name: 'Farm Eggs', cat: 'Dairy', emoji: '🥚', variants: [{ l: 'Dozen', p: 140 }, { l: '6 pcs', p: 75 }] },
    { id: 'c', name: 'Fresh Milk', cat: 'Dairy', emoji: '🥛', variants: [{ l: '1 L', p: 95 }], disc: 5 },
    { id: 'd', name: 'Red Onion', cat: 'Veg', emoji: '🧅', variants: [{ l: '1 kg', p: 70 }], stock: false },
    { id: 'e', name: 'Tomato', cat: 'Veg', emoji: '🍅', variants: [{ l: '500 g', p: 38 }, { l: '1 kg', p: 70 }] }] }),
  clinic: D({ mode: 'clinic', name: 'Dr. Ayesha Rahman', tagline: 'Internal Medicine · Chattogram', wa: '8801700000000', currency: '৳', color: '#2563eb', template: 'editorial', doctor: { name: 'Dr. Ayesha Rahman', quals: 'MBBS, FCPS (Medicine)', specialty: 'Diabetes & Hypertension', fee: 800, address: 'House 12, GEC Circle, Chattogram', bio: '15 years of experience in chronic disease care.', shifts: [{ l: 'Morning', t: '9:00 AM – 12:00 PM', on: true }, { l: 'Evening', t: '5:00 PM – 9:00 PM', on: true }], days: [0, 1, 2, 3, 4, 6] } }),
  service: D({ mode: 'service', name: 'Pixel & Co.', tagline: 'Branding and web studio', wa: '8801700000000', currency: '$', color: '#7c3aed', template: 'grid', items: [
    { id: 's1', name: 'Logo Design', cat: 'Branding', emoji: '🎨', price: 120, desc: '3 concepts, unlimited revisions' },
    { id: 's2', name: 'Landing Page', cat: 'Web', emoji: '💻', price: 350, desc: 'Responsive, fast, SEO-ready' },
    { id: 's3', name: 'Social Kit', cat: 'Branding', emoji: '📱', price: 80, disc: 10, desc: '12 post templates' },
    { id: 's4', name: 'Product Photos', cat: 'Photo', emoji: '📸', price: 60, desc: 'Per 10 edited photos' }] })
};

/* ---------- storefront renderer ---------- */
const thumb = (it, cls) => it.img
  ? `<img src="${esc(imgSrc(it.img))}" class="thumb-i ${cls}" loading="lazy" alt="">`
  : `<div class="thumb ${cls}">${it.emoji || (CUR && CUR.mode === 'service' ? '✨' : '🛒')}</div>`;

function itemHTML(it, st, t) {
  const c = st.currency, v = vars(it), out = it.stock === false, off = it.disc > 0;
  const low = Math.min(...v.map((_, i) => pr(it, i)));
  const price = `<span class="font-semibold">${v.length > 1 ? 'from ' : ''}${money(low, c)}</span>${off ? `<s class="text-xs mut ml-1">${money(Math.min(...v.map(x => x.p)), c)}</s>` : ''}`;
  const sel = v.length > 1 ? `<select data-chg="v" data-v="${it.id}" class="sel mt-1">${v.map((x, i) => `<option value="${i}" ${(U.sel[it.id] || 0) === i ? 'selected' : ''}>${esc(x.l)} · ${money(pr(it, i), c)}</option>`).join('')}</select>` : (v[0].l ? `<div class="text-xs mut">${esc(v[0].l)}</div>` : '');
  const badge = off ? `<span class="badge">-${it.disc}%</span>` : '';
  const svc = st.mode === 'service';
  const act = out ? '<span class="oos">Out of stock</span>'
    : svc ? `<button data-act="inq" data-id="${it.id}" class="btn-wa">${t === 'list' ? 'Inquire' : 'Inquire on WhatsApp'}</button>`
    : t === 'list' ? `<button data-act="add" data-id="${it.id}" class="plus" aria-label="Add ${esc(it.name)}">+</button>`
    : `<button data-act="add" data-id="${it.id}" class="btn-brand w-full">Add to cart</button>`;
  if (t === 'grid') return `<div class="card ${out ? 'opacity-60' : ''}">${badge}${thumb(it, 'w-full aspect-square')}<div class="p-3 flex flex-col gap-1"><div class="font-medium text-sm leading-tight">${esc(it.name)}</div>${it.desc ? `<div class="text-xs mut">${esc(it.desc)}</div>` : ''}<div class="text-sm">${price}</div>${sel}<div class="mt-2">${act}</div></div></div>`;
  if (t === 'list') return `<div class="row ${out ? 'opacity-60' : ''}">${thumb(it, 'w-14 h-14 rounded-xl')}<div class="flex-1 min-w-0"><div class="font-medium text-sm truncate">${esc(it.name)}${badge}</div><div class="text-sm">${price}</div>${sel}</div>${act}</div>`;
  return `<div class="row-lg ${out ? 'opacity-60' : ''}">${thumb(it, 'w-20 h-20 rounded-2xl')}<div class="flex-1 min-w-0"><div class="font-semibold">${esc(it.name)}${badge}</div>${it.desc ? `<p class="text-sm mut mt-0.5">${esc(it.desc)}</p>` : ''}<div class="mt-1">${price}</div>${sel}<div class="mt-2 max-w-[220px]">${act}</div></div></div>`;
}

function head(st, ed) {
  const logo = st.logo ? `<img src="${esc(imgSrc(st.logo))}" class="w-16 h-16 rounded-2xl object-cover border-2 border-white bg-white" alt="">`
    : `<div class="w-16 h-16 rounded-2xl grid place-items-center text-2xl font-bold text-white border-2 border-white" style="background:var(--brand)">${esc((st.name || 'S')[0])}</div>`;
  const ban = st.banner ? `<img class="absolute inset-0 w-full h-full object-cover" src="${esc(imgSrc(st.banner))}" alt="">` : '<div class="absolute inset-0" style="background:linear-gradient(135deg,var(--brand),color-mix(in srgb,var(--brand) 45%,#000))"></div>';
  return `<div class="relative h-32 overflow-hidden">${ban}</div><div class="px-4 -mt-8 relative ${ed ? 'text-center flex flex-col items-center' : 'flex items-end gap-3'}">${logo}<div class="${ed ? 'mt-2' : 'pb-1'}"><h1 class="text-xl font-bold leading-tight">${esc(st.name)}</h1><p class="mut text-sm">${esc(st.tagline)}</p></div></div>`;
}

function nextDays(st) {
  const d = st.doctor || {}, out = [], now = new Date();
  for (let i = 0; i < 14 && out.length < 10; i++) {
    const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if ((d.days || []).includes(x.getDay())) {
      const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      out.push({ iso, dd: x.getDate(), wd: x.toLocaleDateString('en-GB', { weekday: 'short' }) });
    }
  }
  return out;
}

function clinicHTML(st, ed) {
  const d = st.doctor || {}, days = nextDays(st), sh = (d.shifts || []).filter(s => s.on);
  return `<section class="px-4 mt-5"><div class="card p-5 ${ed ? 'text-center' : ''}"><div class="text-lg font-semibold">${esc(d.name)}</div><div class="text-sm font-medium" style="color:var(--brand)">${esc(d.quals)}</div><div class="mut text-sm">${esc(d.specialty)}</div>${d.bio ? `<p class="text-sm mt-3">${esc(d.bio)}</p>` : ''}<div class="mt-3 text-sm flex ${ed ? 'justify-center' : ''} gap-x-4 gap-y-1 flex-wrap"><span>Fee ${money(d.fee, st.currency)}</span><span>${esc(d.address)}</span></div></div></section>
  <section class="px-4 mt-5"><h2 class="sec">Select a date</h2><div class="flex gap-2 overflow-x-auto pb-1">${days.map(x => `<button data-act="date" data-d="${x.iso}" class="chip date ${U.date === x.iso ? 'on' : ''}"><b>${x.dd}</b><small>${x.wd}</small></button>`).join('') || '<p class="mut text-sm">No available days yet.</p>'}</div>
  <h2 class="sec mt-4">Select a shift</h2><div class="grid grid-cols-2 gap-2">${sh.map((s, i) => `<button data-act="shift" data-i="${i}" class="chip ${U.shift === i ? 'on' : ''}">${esc(s.l)}<small>${esc(s.t)}</small></button>`).join('')}</div></section>
  <div class="px-4 mt-5"><button data-act="book" class="btn-brand w-full py-3">Book Appointment</button></div>`;
}

function cartLines(st) {
  return Object.entries(U.cart).map(([k, l]) => {
    const it = st.items.find(i => i.id === l.id);
    return it ? { k, it, l, vl: vars(it)[l.v] || vars(it)[0], p: pr(it, l.v) } : null;
  }).filter(Boolean);
}
const cartTotal = L => L.reduce((a, x) => a + x.p * x.l.q, 0);

function cartUI(st) {
  const L = cartLines(st), n = L.reduce((a, x) => a + x.l.q, 0), c = st.currency, f = U.form;
  if (!n) return '';
  const bar = `<button data-act="cart" class="cartbar"><span>${n} item${n > 1 ? 's' : ''}</span><b>${money(cartTotal(L), c)}</b><span>View cart</span></button>`;
  if (!U.cartOpen) return bar;
  return bar + `<div class="drawer-bg" data-act="cart-close"></div><div class="drawer"><div class="flex justify-between items-center mb-3"><h3 class="font-semibold text-lg">Your cart</h3><button data-act="cart-close" class="mut text-xl" aria-label="Close">✕</button></div>
  ${L.map(x => `<div class="flex items-center gap-3 py-2 border-b" style="border-color:var(--sbd)"><div class="flex-1 min-w-0"><div class="text-sm font-medium truncate">${esc(x.it.name)}</div><div class="text-xs mut">${esc(x.vl.l)} ${money(x.p, c)}</div></div><div class="qty"><button data-act="dec" data-k="${x.k}">−</button><b class="text-sm w-4 text-center">${x.l.q}</b><button data-act="inc" data-k="${x.k}">+</button></div><div class="w-16 text-right text-sm font-medium">${money(x.p * x.l.q, c)}</div></div>`).join('')}
  <div class="seg mt-4"><button data-act="dm" data-m="delivery" class="${U.mode === 'delivery' ? 'on' : ''}">Delivery</button><button data-act="dm" data-m="pickup" class="${U.mode === 'pickup' ? 'on' : ''}">Pickup</button></div>
  <div class="grid gap-2 mt-3"><input data-f="name" class="inp" placeholder="Your name" value="${esc(f.name)}"><input data-f="phone" type="tel" class="inp" placeholder="Phone number" value="${esc(f.phone)}">${U.mode === 'delivery' ? `<textarea data-f="addr" rows="2" class="inp" placeholder="Delivery address">${esc(f.addr)}</textarea>` : ''}<input data-f="note" class="inp" placeholder="Note (optional)" value="${esc(f.note)}"></div>
  <div class="flex justify-between font-semibold mt-4"><span>Total</span><span>${money(cartTotal(L), c)}</span></div>
  <button data-act="order" class="btn-wa mt-3 py-3 text-base">Place order on WhatsApp</button></div>`;
}

function Storefront(st, ui) {
  const ed = st.template === 'editorial', t = st.template || 'grid', items = st.items || [];
  const cats = ['All', ...new Set(items.map(i => i.cat).filter(Boolean))];
  let body;
  if (st.mode === 'clinic') body = clinicHTML(st, ed);
  else {
    const shown = items.filter(i => ui.cat === 'All' || i.cat === ui.cat);
    body = `${cats.length > 2 ? `<div class="px-4 mt-4 flex gap-2 overflow-x-auto">${cats.map(c => `<button data-act="cat" data-c="${esc(c)}" class="chip ${ui.cat === c ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>` : ''}
    <section class="px-4 mt-4 ${t === 'grid' ? 'grid grid-cols-2 gap-3' : t === 'list' ? 'flex flex-col gap-2' : ''}">${shown.map(i => itemHTML(i, st, t)).join('') || '<p class="mut text-sm col-span-2">Nothing here yet.</p>'}</section>`;
  }
  const foot = st.tier === 'pro' ? '' : `<p class="text-center text-xs mut mt-8">Powered by ${esc(SET.platformName)}</p>`;
  return `<div class="sf ${st.dark ? 'dark' : ''}" style="--brand:${esc(st.color || '#111827')}">${head(st, ed)}${body}${foot}${!ui.preview && st.mode === 'shop' ? cartUI(st) : ''}</div>`;
}

/* ---------- order saving / WhatsApp ---------- */
async function saveOrder(slug, o) {
  try { await api('/order', { slug, order: o }); } catch {
    try { const k = 'wsb_orders_' + slug, a = JSON.parse(localStorage.getItem(k) || '[]'); a.unshift(o); localStorage.setItem(k, JSON.stringify(a.slice(0, 200))); } catch { }
  }
}
const saveWait = (slug, o) => Promise.race([saveOrder(slug, o), new Promise(r => setTimeout(r, 1200))]);
const waGo = (n, m) => { location.href = `https://wa.me/${digits(n)}?text=${encodeURIComponent(m)}`; };
const oid = () => 'O' + Date.now().toString(36).toUpperCase().slice(-6);

/* ---------- generic UI helpers ---------- */
function modal(h, cls = '', style = '') {
  closeModal();
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal ${cls}" style="${style}">${h}</div>`;
  m.addEventListener('click', e => { if (e.target === m) closeModal(); });
  document.body.appendChild(m);
  return m;
}
const closeModal = () => { const m = $('.modal-bg'); if (m) m.remove(); };
const sfStyle = st => ['sf' + (st.dark ? ' dark' : ''), `--brand:${st.color}`];

/* ---------- actions ---------- */
const ACT = {}, CHG = {};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t || t.closest('.inert')) return;
  const f = ACT[t.dataset.act];
  if (f) { if (t.tagName !== 'INPUT') e.preventDefault(); f(t.dataset, t, e); }
});
document.addEventListener('change', e => { const t = e.target, f = CHG[t.dataset.chg]; if (f) f(t, e); });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f) U.form[t.dataset.f] = t.value;
  if (t.dataset.sq !== undefined && S.sa) { S.sa.q = t.value; saRows(); }
  if (t.dataset.d && S.store) {
    S.store[t.dataset.d] = t.type === 'checkbox' ? t.checked : t.value;
    pv(); commit();
  }
});

/* storefront actions */
const rs = () => { const y = scrollY; app(Storefront(CUR, U)); scrollTo(0, y); };
ACT.cat = d => { U.cat = d.c; rs(); };
ACT.add = d => { const v = U.sel[d.id] || 0, k = d.id + '|' + v; U.cart[k] = U.cart[k] || { id: d.id, v, q: 0 }; U.cart[k].q++; rs(); };
ACT.inc = d => { U.cart[d.k].q++; rs(); };
ACT.dec = d => { if (--U.cart[d.k].q <= 0) delete U.cart[d.k]; if (!Object.keys(U.cart).length) U.cartOpen = false; rs(); };
ACT.cart = () => { U.cartOpen = true; rs(); };
ACT['cart-close'] = () => { U.cartOpen = false; rs(); };
ACT.dm = d => { U.mode = d.m; rs(); };
ACT.date = d => { U.date = d.d; rs(); };
ACT.shift = d => { U.shift = +d.i; rs(); };
CHG.v = t => { U.sel[t.dataset.v] = +t.value; };

ACT.order = async () => {
  const st = CUR, L = cartLines(st), f = U.form, c = st.currency;
  if (!L.length) return;
  if (!f.name || !f.phone) return toast('Enter your name and phone');
  if (U.mode === 'delivery' && !f.addr) return toast('Enter your delivery address');
  const tot = cartTotal(L);
  const lines = [...L.map(x => `• ${x.l.q} × ${x.it.name}${x.vl.l ? ` (${x.vl.l})` : ''} — ${money(x.p * x.l.q, c)}`), '', `💰 *Total: ${money(tot, c)}*`, `🚚 ${U.mode === 'delivery' ? 'Delivery to: ' + f.addr : 'Pickup from store'}`, '', `👤 ${f.name}`, `📞 ${f.phone}`, ...(f.note ? [`📝 ${f.note}`] : [])];
  const o = { id: oid(), type: 'order', ts: Date.now(), total: tot, status: 'Pending', customer: { name: f.name, phone: f.phone }, lines };
  await saveWait(st.slug, o);
  U.cart = {}; U.cartOpen = false; rs();
  waGo(st.wa, [`🛒 *New Order — ${st.name}*`, `🧾 #${o.id}`, '', ...lines].join('\n'));
};

ACT.inq = d => {
  const st = CUR, it = st.items.find(i => i.id === d.id), c = st.currency;
  const o = { id: oid(), type: 'inquiry', ts: Date.now(), total: pr(it), status: 'Pending', customer: { name: 'Website visitor', phone: '' }, lines: [`✨ ${it.name}`, `💰 From ${money(pr(it), c)}`] };
  saveWait(st.slug, o).then(() => waGo(st.wa, [`👋 Hi ${st.name}!`, `I'd like to inquire about:`, '', `✨ *${it.name}*`, `💰 ${money(pr(it), c)}`, it.desc ? `📄 ${it.desc}` : '', '', 'Please share more details.'].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n')));
};

ACT.book = () => {
  const st = CUR, d = st.doctor, sh = (d.shifts || []).filter(s => s.on)[U.shift];
  if (!U.date) return toast('Pick a date');
  if (!sh) return toast('Pick a shift');
  const [cls, sty] = sfStyle(st);
  modal(`<form id="bf" class="grid gap-3"><h3 class="font-semibold text-lg">Book Appointment</h3><p class="text-sm mut">${fmtDate(U.date)} · ${esc(sh.l)} (${esc(sh.t)})</p>
  <input name="name" class="inp" placeholder="Patient name" required><input name="age" type="number" min="0" max="120" class="inp" placeholder="Age" required><input name="phone" type="tel" class="inp" placeholder="Phone number" required><textarea name="note" rows="3" class="inp" placeholder="Problem note"></textarea><button class="btn-wa py-3 text-base">Confirm on WhatsApp</button></form>`, cls, sty);
  $('#bf').onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const lines = [`📅 Date: ${fmtDate(U.date)}`, `🕒 Shift: ${sh.l} (${sh.t})`, `👤 Patient: ${f.name}`, `🎂 Age: ${f.age}`, `📞 Phone: ${f.phone}`, `📝 Problem: ${f.note || '—'}`, `💳 Fee: ${money(d.fee, st.currency)}`, `📍 Chamber: ${d.address}`];
    const o = { id: oid(), type: 'booking', ts: Date.now(), total: +d.fee || 0, status: 'Pending', customer: { name: f.name, phone: f.phone }, lines };
    await saveWait(st.slug, o);
    closeModal();
    waGo(st.wa, [`🩺 *Appointment Request — ${d.name}*`, `🧾 #${o.id}`, '', ...lines].join('\n'));
  };
};

/* ---------- routing ---------- */
const route = () => {
  const q = new URLSearchParams(location.search).get('store');
  return q ? { v: 'store', slug: q } : { v: (location.hash || '#home').slice(1) };
};
async function go() {
  closeModal();
  const r = route();
  if (r.v === 'store') return loadStore(r.slug);
  if (r.v === 'dashboard') return dashboard();
  if (r.v === 'super-admin') return superAdmin();
  landing();
}
async function getUser() { try { return signed() ? await puter.auth.getUser() : null; } catch { return null; } }
async function signIn() { try { await puter.auth.signIn(); return await getUser(); } catch { toast('Sign-in was cancelled'); return null; } }
ACT.start = async () => { const u = await signIn(); if (!u) return; S.user = u; const to = location.hash === '#super-admin' ? '#super-admin' : '#dashboard'; if (location.hash === to) go(); else location.hash = to; };
ACT.out = async () => { try { await puter.auth.signOut(); } catch { } S = { tab: 'overview', pub: '' }; location.hash = '#home'; go(); };
const gate = (msg) => `<div class="min-h-screen grid place-items-center p-6 text-center"><div><div class="text-4xl">💬</div><h1 class="text-2xl font-bold mt-3">${msg}</h1><button data-act="start" class="btn-dark mt-5">Sign in with Puter</button><div class="mt-3"><a href="#home" class="text-sm mut">Back to home</a></div></div></div>`;


/* ---------- public store ---------- */
async function loadStore(slug) {
  app(spinner);
  let st = null, off = null;
  try {
    const r = await api('/store?slug=' + encodeURIComponent(slug));
    Object.assign(SET, r.settings || {});
    if (r.suspended) off = r.name; else st = r.store;
  } catch (e) { if (e.code !== 'not_found') st = await jsonp(subURL(slug) + '/store.js', '__WSB_STORE'); }
  if (off) return app(`<div class="min-h-screen grid place-items-center text-center p-6"><div><div class="text-5xl">⏸️</div><h1 class="text-xl font-semibold mt-3">${esc(off)} is temporarily unavailable</h1><p class="mut mt-1">Please check back later.</p></div></div>`);
  if (!st && signed()) st = await K.get('store:' + slug);
  if (!st) return app('<div class="min-h-screen grid place-items-center text-center p-6"><div><div class="text-5xl">🔍</div><h1 class="text-xl font-semibold mt-3">Store not found</h1><p class="mut mt-1">This page doesn’t exist or hasn’t been published yet.</p><a href="#home" class="btn-dark inline-block mt-4">Create your own page</a></div></div>');
  CUR = st; U = freshU(); U.date = (nextDays(st)[0] || {}).iso || '';
  document.title = st.name;
  try { const k = 'wsb_v_' + slug; if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); api('/view', { slug }).catch(() => { }); } } catch { }
  rs();
}

/* ---------- landing ---------- */
function landing() {
  document.title = SET.platformName + ' — WhatsApp Storefront & Booking';
  app(`${bannerHTML()}<header class="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between"><a href="#home" class="font-bold tracking-tight text-lg">💬 ${esc(SET.platformName)}</a><nav class="flex items-center gap-4 text-sm"><a href="#super-admin" class="mut hidden sm:block">Admin</a><button data-act="start" class="btn-dark">Sign in</button></nav></header>
  <main><section class="max-w-3xl mx-auto px-5 pt-14 pb-10 text-center"><h1 class="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05]">Launch your WhatsApp Store or Clinic Booking Page in 60 seconds</h1><p class="mut mt-5 text-lg max-w-xl mx-auto">Customers browse, add to cart or pick a slot, and the finished order lands in your WhatsApp. No app, no website builder, no monthly bill to start.</p><button data-act="start" class="btn-dark text-base px-7 py-3 mt-8">Create Your Free Page</button></section>
  <section class="max-w-5xl mx-auto px-5 pb-16 grid md:grid-cols-2 gap-10 items-center"><div><h2 class="text-2xl font-semibold tracking-tight">See it live</h2><p class="mut mt-2">Pick a business type to preview the page your customers will see.</p><div class="flex flex-col gap-2 mt-5" id="demo-tabs">${[['shop', 'Grocery Store', 'Quick-add rows, variants, cart drawer'], ['clinic', 'Doctor’s Chamber', 'Date and shift booking'], ['service', 'Service Business', 'Portfolio cards, WhatsApp inquiry']].map(([k, n, d]) => `<button data-act="demo" data-k="${k}" class="tplbtn ${k === 'shop' ? 'on' : ''}"><b class="text-sm">${n}</b><span>${d}</span></button>`).join('')}</div></div><div class="phone"><div class="phone-in" id="demo"></div></div></section>
  <section class="max-w-5xl mx-auto px-5 pb-20 grid sm:grid-cols-3 gap-4">${[['Three templates', 'Clean Grid, Compact List and Editorial Profile, with your colors and logo.'], ['Orders in WhatsApp', 'Itemized messages with totals, addresses and appointment details.'], ['Share anywhere', 'One link and a QR code for your counter, flyers or Facebook page.']].map(([a, b]) => `<div class="card2 p-5"><h3 class="font-semibold">${a}</h3><p class="mut text-sm mt-1">${b}</p></div>`).join('')}</section></main>
  <footer class="text-center text-xs mut pb-10">© ${new Date().getFullYear()} ${esc(SET.platformName)}</footer>`);
  demo('shop');
}
const demo = k => { CUR = DEMOS[k]; $('#demo').innerHTML = '<div class="inert">' + Storefront(DEMOS[k], { ...freshU(), preview: true }) + '</div>'; };
ACT.demo = (d, t) => { demo(d.k); document.querySelectorAll('#demo-tabs .tplbtn').forEach(b => b.classList.toggle('on', b === t)); };

/* ---------- merchant dashboard ---------- */
async function dashboard() {
  app(spinner);
  S.user = await getUser();
  if (!S.user) return app(gate('Sign in to manage your page'));
  const slug = await K.get('my-slug');
  let st = slug ? await K.get('store:' + slug) : null;
  if (!st) return onboarding();
  S.key = await K.get('okey:' + slug);
  if (!S.key) { S.key = newKey(); await K.set('okey:' + slug, S.key); }
  S.views = 0; S.online = false;
  try {
    let r;
    try { r = await api('/m-get', { slug, ownerKey: S.key }); } catch (e) {
      if (e.code !== 'not_found') throw e;
      await api('/register', { slug, ownerKey: S.key, owner: S.user.username, store: st });
      r = await api('/m-get', { slug, ownerKey: S.key });
    }
    if (r.store) st = { ...st, ...r.store };
    st.tier = r.tier; st.status = r.status; Object.assign(SET, r.settings || {});
    S.online = true;
  } catch (e) { console.error(e); toast(e.code === 'taken' ? 'This link name belongs to another account' : 'Backend unreachable. Check WORKER_URL (see README).'); }
  S.store = st; CUR = st; S.pub = S.pub || '';
  S.orders = await loadOrders();
  await preload();
  shell();
}
async function loadOrders() {
  const s = S.store;
  if (S.online) { try { const r = await api('/m-orders', { slug: s.slug, ownerKey: S.key }); S.views = r.views; return r.orders; } catch { } }
  try { return JSON.parse(localStorage.getItem('wsb_orders_' + s.slug) || '[]'); } catch { return []; }
}
async function preload() {
  const s = S.store, fs = [s.logo, s.banner, ...s.items.map(i => i.img)].filter(Boolean);
  await Promise.all(fs.map(async f => { try { IMG[f] = await puter.fs.getReadURL(`wsb/${s.slug}/${f}`); } catch { } }));
}

function onboarding() {
  document.title = 'Create your page';
  app(`<div class="min-h-screen grid place-items-center p-5"><form id="ob" class="card2 p-6 w-full max-w-lg grid gap-4"><div><h1 class="text-2xl font-bold tracking-tight">Create your page</h1><p class="mut text-sm">Welcome, ${esc(S.user.username)}. Three quick steps.</p></div>
  <div class="grid gap-2"><div class="lbl">Business type</div>${[['shop', 'Grocery or online store', 'Products, variants, cart and delivery'], ['clinic', 'Doctor, clinic or consultant', 'Profile, fee and appointment slots'], ['service', 'General business or services', 'Service cards with WhatsApp inquiry']].map(([k, n, d], i) => `<label class="mode"><input type="radio" name="mode" value="${k}" ${i === 0 ? 'checked' : ''}><b class="text-sm">${n}</b><div class="mut text-xs">${d}</div></label>`).join('')}</div>
  <input name="name" class="inp" placeholder="Business or doctor name" required><div><input name="slug" class="inp" placeholder="page-link-name" required pattern="[a-z0-9\\-]{3,30}"><p class="text-xs mut mt-1">Your link: <span id="slugp">?store=your-name</span></p></div>
  <div class="grid grid-cols-3 gap-2"><input name="wa" type="tel" class="inp col-span-2" placeholder="WhatsApp number with country code" required><select name="currency" class="inp">${['৳', '$', '₹', '€', '£', '₨', '¥'].map(c => `<option>${c}</option>`).join('')}</select></div>
  <button class="btn-dark py-3">Create my page</button></form></div>`);
  const f = $('#ob');
  f.elements.name.addEventListener('input', () => { if (!f.elements.slug.dataset.m) { f.elements.slug.value = slugify(f.elements.name.value); } $('#slugp').textContent = '?store=' + f.elements.slug.value; });
  f.elements.slug.addEventListener('input', () => { const e = f.elements.slug; e.dataset.m = 1; e.value = slugify(e.value); $('#slugp').textContent = '?store=' + e.value; });
  f.onsubmit = async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f)), slug = slugify(v.slug);
    if (slug.length < 3 || CFG.RESERVED.includes(slug)) return toast('Choose another link name');
    const st = { slug, name: v.name, mode: v.mode, wa: digits(v.wa), currency: v.currency, color: '#111827', dark: false, tagline: '', logo: '', banner: '', tier: 'free', views: 0, createdAt: Date.now(), items: [], template: v.mode === 'clinic' ? 'editorial' : v.mode === 'shop' ? 'list' : 'grid', doctor: { name: v.mode === 'clinic' ? v.name : '', quals: '', specialty: '', fee: 0, address: '', bio: '', shifts: [{ l: 'Morning', t: '9:00 AM – 1:00 PM', on: true }, { l: 'Evening', t: '5:00 PM – 9:00 PM', on: true }], days: [0, 1, 2, 3, 4, 6] } };
    const key = newKey();
    try { await api('/register', { slug, ownerKey: key, owner: S.user.username, store: st }); } catch (err) {
      return toast(err.code === 'taken' ? 'That link name is taken' : err.code === 'signups_closed' ? 'New sign-ups are closed right now' : 'Backend unreachable. See README.');
    }
    await K.set('store:' + slug, st); await K.set('my-slug', slug); await K.set('okey:' + slug, key);
    S.key = key; S.online = true; S.views = 0; st.tier = 'free'; st.status = 'active';
    S.store = st; S.tab = 'overview'; CUR = st; S.orders = []; IMG = {};
    shell(); publish();
  };
}

function shell() {
  const s = S.store, tabs = [['overview', 'Overview'], ['catalog', s.mode === 'clinic' ? 'Doctor & Slots' : s.mode === 'shop' ? 'Products' : 'Services'], ['orders', s.mode === 'clinic' ? 'Appointments' : 'Orders'], ['design', 'Design & Templates']];
  const tier = tierOf();
  document.title = s.name + ' · Dashboard';
  app(`${bannerHTML()}${s.status === 'suspended' ? '<div class="notice" style="background:#b91c1c">This page is suspended by the platform. Customers cannot open it or place orders. Contact the platform owner.</div>' : ''}<header class="border-b bd bg-white sticky top-0 z-20"><div class="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3"><a href="#home" class="font-bold">💬</a><span class="font-semibold truncate">${esc(s.name)}</span><span class="pill ${tier === 'pro' ? 'pro' : ''}">${tier}</span><span id="pubst" class="mut text-xs ml-auto hidden sm:block">${S.pub}</span>${isAdmin(S.user) ? '<a href="#super-admin" class="btn-ghost">Super admin</a>' : ''}<a target="_blank" rel="noopener" href="?store=${s.slug}" class="btn-ghost">View store</a><button data-act="out" class="btn-ghost">Sign out</button></div><nav class="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto pb-2">${tabs.map(([k, l]) => `<button data-act="tab" data-t="${k}" class="tab ${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav></header><main id="panel" class="max-w-6xl mx-auto px-4 py-6"></main>`);
  panel();
}
const panel = () => ({ overview: ov, catalog: cat, orders: ord, design: des }[S.tab])();
ACT.tab = d => { S.tab = d.t; shell(); };
const setPub = () => { const e = $('#pubst'); if (e) e.textContent = S.pub; };

let pt;
function commit() {
  clearTimeout(pt);
  S.pub = 'Saving…'; setPub();
  K.set('store:' + S.store.slug, S.store);
  pt = setTimeout(publish, 1500);
}
async function host(sub, dir) { try { await puter.hosting.create(sub, dir); } catch { await puter.hosting.update(sub, dir); } }
async function publish() {
  const s = S.store; if (!s) return;
  S.pub = 'Publishing…'; setPub();
  let ok = true;
  try { await api('/m-sync', { slug: s.slug, ownerKey: S.key, store: s }); } catch (e) { console.error(e); ok = false; }
  try {
    const dir = 'wsb/' + s.slug;
    await puter.fs.write(dir + '/store.js', 'window.__WSB_STORE=' + JSON.stringify(s) + ';', { overwrite: true, createMissingParents: true });
    await host('wsb-' + s.slug, dir);
  } catch (e) { console.error(e); ok = false; }
  S.pub = ok ? 'Published' : 'Not fully published. Tap Publish now.'; setPub();
}
ACT.pub = async () => { await publish(); toast(S.pub); };
ACT.copy = () => { const v = $('#lnk').value; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast('Store link copied'), () => { $('#lnk').select(); document.execCommand('copy'); toast('Store link copied'); }); };

async function upload(file) {
  const bmp = await createImageBitmap(file), sc = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .82)), f = uid() + '.jpg', p = `wsb/${S.store.slug}/${f}`;
  await puter.fs.write(p, blob, { createMissingParents: true });
  IMG[f] = await puter.fs.getReadURL(p);
  return f;
}

/* overview */
function ov() {
  const s = S.store, o = S.orders, rev = o.filter(x => x.status !== 'Cancelled').reduce((a, x) => a + x.total, 0);
  const link = storeLink(s);
  $('#panel').innerHTML = `<div class="grid sm:grid-cols-3 gap-4">${[['Total views', S.views || 0], [s.mode === 'clinic' ? 'Bookings' : 'WhatsApp orders', o.length], ['Estimated revenue', money(rev, s.currency)]].map(([a, b]) => `<div class="card2 p-5"><div class="mut text-sm">${a}</div><div class="text-3xl font-bold tracking-tight mt-1">${b}</div></div>`).join('')}</div>
  <div class="card2 mt-6 p-5 flex flex-col md:flex-row gap-6"><div class="flex-1 min-w-0"><h3 class="font-semibold">Your store link</h3><div class="flex gap-2 mt-2"><input readonly id="lnk" class="inp" value="${esc(link)}"><button data-act="copy" class="btn-dark whitespace-nowrap">Copy Store Link</button></div><p class="text-xs mut mt-3">Status: <span id="pubst2">${esc(S.pub || 'Not published yet')}</span>. Changes publish automatically.</p><button data-act="pub" class="btn-ghost mt-3">Publish now</button></div><div id="qr" class="p-3 bg-white border bd rounded-xl self-start"></div></div>`;
  if (window.QRCode) new QRCode($('#qr'), { text: link, width: 140, height: 140 });
}

/* catalog */
function cat() { S.store.mode === 'clinic' ? docForm() : itemList(); }
function itemList() {
  const s = S.store;
  const rows = s.items.map(i => `<div class="card2 p-3 flex items-center gap-3">${thumb(i, 'w-12 h-12 rounded-lg')}<div class="flex-1 min-w-0"><div class="font-medium truncate">${esc(i.name)}</div><div class="mut text-xs">${esc(i.cat || 'No category')} · ${money(vars(i)[0].p, s.currency)}${vars(i).length > 1 ? ` (${vars(i).length} variants)` : ''}${i.disc ? ` · -${i.disc}%` : ''}</div></div><label class="sw" title="Available"><input type="checkbox" data-chg="stock" data-id="${i.id}" ${i.stock !== false ? 'checked' : ''}><i></i></label><button data-act="edit" data-id="${i.id}" class="btn-ghost">Edit</button><button data-act="del" data-id="${i.id}" class="btn-ghost text-red-600">Delete</button></div>`).join('');
  $('#panel').innerHTML = `<div class="flex items-center justify-between mb-4"><div><h2 class="font-semibold text-lg">${s.mode === 'shop' ? 'Products' : 'Services'}</h2><p class="mut text-xs">${s.items.length}${limitOf() ? ' / ' + limitOf() : ''} items</p></div><button data-act="new" class="btn-dark">Add ${s.mode === 'shop' ? 'product' : 'service'}</button></div><div class="grid gap-2 max-w-3xl">${rows || '<p class="mut">Nothing here yet. Add your first item to start taking orders.</p>'}</div>`;
}
CHG.stock = t => { const i = S.store.items.find(x => x.id === t.dataset.id); i.stock = t.checked; commit(); toast(t.checked ? 'Marked in stock' : 'Marked out of stock'); };
ACT.new = () => { const L = limitOf(); if (L && S.store.items.length >= L) return toast(`Your plan allows ${L} items. Ask the platform owner to upgrade you to Pro.`); itemForm(); };
ACT.edit = d => itemForm(d.id);
ACT.del = d => { if (!confirm('Delete this item?')) return; S.store.items = S.store.items.filter(i => i.id !== d.id); commit(); itemList(); };
function itemForm(id) {
  const s = S.store, i = s.items.find(x => x.id === id) || {}, v = vars(i);
  modal(`<form id="if" class="grid gap-3"><h3 class="font-semibold text-lg">${id ? 'Edit' : 'Add'} ${s.mode === 'shop' ? 'product' : 'service'}</h3><input name="name" class="inp" placeholder="Name" required value="${esc(i.name)}"><input name="cat" class="inp" placeholder="Category" value="${esc(i.cat)}"><div class="grid grid-cols-2 gap-2"><input name="price" type="number" step="any" min="0" class="inp" placeholder="${s.mode === 'shop' ? 'Price' : 'Starting price'}" value="${v.length > 1 ? '' : esc(i.id ? v[0].p : '')}"><input name="disc" type="number" min="0" max="90" class="inp" placeholder="Discount %" value="${i.disc || ''}"></div>${s.mode === 'shop' ? `<input name="vars" class="inp" placeholder="Variants: 1kg=120, 500g=65, 1 pc=10" value="${esc(v.length > 1 ? v.map(x => x.l + '=' + x.p).join(', ') : '')}">` : ''}<textarea name="desc" rows="2" class="inp" placeholder="Description">${esc(i.desc)}</textarea><label class="text-sm">Photo <input type="file" name="img" accept="image/*" class="block mt-1 text-sm"></label><button class="btn-dark py-2.5">Save</button></form>`);
  $('#if').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, fd = Object.fromEntries(new FormData(f)), btn = f.querySelector('button');
    const vs = (fd.vars || '').split(',').map(x => x.split('=')).filter(a => a[1] && +a[1] > 0).map(a => ({ l: a[0].trim(), p: +a[1] }));
    if (!vs.length && !(+fd.price >= 0 && fd.price !== '')) return toast('Enter a price or variants');
    btn.disabled = true; btn.textContent = 'Saving…';
    const n = { ...i, id: i.id || uid(), name: fd.name.trim(), cat: fd.cat.trim(), disc: Math.min(90, +fd.disc || 0), desc: fd.desc.trim(), stock: i.stock !== false };
    if (vs.length) { n.variants = vs; n.price = vs[0].p; } else { delete n.variants; n.price = +fd.price; }
    try { const file = f.elements.img.files[0]; if (file) n.img = await upload(file); } catch (err) { console.error(err); toast('Photo upload failed; saved without it'); }
    const idx = S.store.items.findIndex(x => x.id === n.id);
    if (idx > -1) S.store.items[idx] = n; else S.store.items.push(n);
    commit(); closeModal(); itemList();
  };
}
function docForm() {
  const d = S.store.doctor, w = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  $('#panel').innerHTML = `<form id="docf" class="card2 p-5 max-w-2xl grid gap-3"><h2 class="font-semibold text-lg">Doctor profile</h2><div class="grid sm:grid-cols-2 gap-3"><input name="name" class="inp" placeholder="Doctor name" value="${esc(d.name)}" required><input name="quals" class="inp" placeholder="Qualifications (MBBS, FCPS)" value="${esc(d.quals)}"><input name="specialty" class="inp" placeholder="Specialty" value="${esc(d.specialty)}"><input name="fee" type="number" min="0" class="inp" placeholder="Consultation fee" value="${esc(d.fee)}"></div><input name="address" class="inp" placeholder="Chamber address" value="${esc(d.address)}"><textarea name="bio" rows="3" class="inp" placeholder="Short bio">${esc(d.bio)}</textarea>
  <h3 class="font-semibold pt-2">Shifts</h3>${d.shifts.map((s, i) => `<div class="flex gap-2 items-center"><label class="sw"><input type="checkbox" name="on${i}" ${s.on ? 'checked' : ''}><i></i></label><input name="l${i}" class="inp" value="${esc(s.l)}"><input name="t${i}" class="inp" value="${esc(s.t)}"></div>`).join('')}
  <h3 class="font-semibold pt-2">Available days</h3><div class="flex flex-wrap gap-2">${w.map((x, i) => `<label class="chip2"><input type="checkbox" name="day" value="${i}" ${d.days.includes(i) ? 'checked' : ''}>${x}</label>`).join('')}</div><button class="btn-dark mt-2">Save profile</button></form>`;
  $('#docf').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    S.store.doctor = { name: f.get('name'), quals: f.get('quals'), specialty: f.get('specialty'), fee: +f.get('fee') || 0, address: f.get('address'), bio: f.get('bio'), shifts: d.shifts.map((s, i) => ({ l: f.get('l' + i), t: f.get('t' + i), on: f.has('on' + i) })), days: f.getAll('day').map(Number) };
    S.store.name = S.store.doctor.name || S.store.name;
    commit(); toast('Profile saved');
  };
}

/* orders */
function ord() {
  const o = S.orders;
  $('#panel').innerHTML = o.length ? `<div class="grid gap-3 max-w-3xl">${o.map(x => `<div class="card2 p-4"><div class="flex flex-wrap items-center gap-2"><b>#${esc(x.id)}</b><span class="pill">${esc(x.type)}</span><span class="mut text-xs">${new Date(x.ts).toLocaleString()}</span><select data-chg="st" data-id="${esc(x.id)}" class="inp ml-auto" style="width:auto;padding:.3rem .5rem">${['Pending', 'Confirmed', 'Completed', 'Cancelled'].map(v => `<option ${v === x.status ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div class="text-sm mt-2 whitespace-pre-line">${esc(x.lines.join('\n'))}</div><div class="flex items-center gap-3 mt-3 text-sm"><b>${money(x.total, S.store.currency)}</b>${digits(x.customer.phone) ? `<a class="btn-ghost" target="_blank" rel="noopener" href="https://wa.me/${digits(x.customer.phone)}">Message customer</a>` : ''}</div></div>`).join('')}</div>`
    : '<div class="card2 p-8 text-center max-w-md"><p class="font-medium">No orders yet</p><p class="mut text-sm mt-1">Orders and bookings appear here as soon as customers place them. Each one also arrives in your WhatsApp chat.</p></div>';
}
CHG.st = async t => {
  const x = S.orders.find(o => o.id === t.dataset.id); x.status = t.value;
  try { await api('/m-status', { slug: S.store.slug, ownerKey: S.key, ts: x.ts, id: x.id, status: x.status }); toast('Status updated'); } catch { toast('Could not update status'); }
};

/* design */
const pv = () => { const e = $('#pv'); if (e) { CUR = S.store; e.innerHTML = '<div class="inert">' + Storefront(S.store, { ...freshU(), preview: true }) + '</div>'; } };
function des() {
  const s = S.store;
  $('#panel').innerHTML = `<div class="grid lg:grid-cols-[1fr_380px] gap-8"><div class="grid gap-5 content-start max-w-2xl">
  <div><div class="lbl">Template</div><div class="grid grid-cols-3 gap-2">${[['grid', 'Clean Grid', '2-column cards'], ['list', 'Compact List', 'Fast + quick-add'], ['editorial', 'Editorial Profile', 'Centered sections']].map(([k, n, d]) => `<button data-act="tpl" data-k="${k}" class="tplbtn ${s.template === k ? 'on' : ''}"><b>${n}</b><span>${d}</span></button>`).join('')}</div></div>
  <div class="grid sm:grid-cols-2 gap-4"><label class="text-sm">Page name<input data-d="name" class="inp mt-1" value="${esc(s.name)}"></label><label class="text-sm">Tagline<input data-d="tagline" class="inp mt-1" value="${esc(s.tagline)}"></label><label class="text-sm">WhatsApp number<input data-d="wa" type="tel" class="inp mt-1" value="${esc(s.wa)}"></label><label class="text-sm">Currency<select data-d="currency" class="inp mt-1">${['৳', '$', '₹', '€', '£', '₨', '¥'].map(c => `<option ${c === s.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
  <label class="text-sm">Accent color<input data-d="color" type="color" class="inp mt-1 h-10 p-1" value="${esc(s.color)}"></label><div class="text-sm">Appearance<div class="seg mt-1" style="background:#f3f4f6"><button data-act="theme" data-m="0" class="${!s.dark ? 'on' : ''}" style="${!s.dark ? 'background:#0a0a0a;color:#fff' : ''}">Light</button><button data-act="theme" data-m="1" class="${s.dark ? 'on' : ''}" style="${s.dark ? 'background:#0a0a0a;color:#fff' : ''}">Dark</button></div></div>
  <label class="text-sm">Logo<input type="file" accept="image/*" data-chg="up" data-k="logo" class="block mt-1 text-sm"></label><label class="text-sm">Cover banner<input type="file" accept="image/*" data-chg="up" data-k="banner" class="block mt-1 text-sm"></label></div></div>
  <div class="lg:sticky lg:top-28 self-start w-full"><div class="phone"><div class="phone-in" id="pv"></div></div></div></div>`;
  pv();
}
ACT.tpl = d => { S.store.template = d.k; commit(); des(); };
ACT.theme = d => { S.store.dark = d.m === '1'; commit(); des(); };
CHG.up = async t => {
  const f = t.files[0]; if (!f) return;
  toast('Uploading…');
  try { S.store[t.dataset.k] = await upload(f); commit(); pv(); toast('Image saved'); } catch (e) { console.error(e); toast('Upload failed. Try a smaller image.'); }
};

/* ---------- super admin ---------- */
const adminKey = () => { try { return localStorage.getItem('wsb_admin_key') || ''; } catch { return ''; } };
const aapi = (path, body = {}) => api(path, { ...body, adminKey: adminKey() });
async function superAdmin() {
  app(spinner);
  const u = await getUser();
  if (!u) return app(gate('Super admin: sign in'));
  if (!isAdmin(u)) return app(`<div class="min-h-screen grid place-items-center text-center p-6"><div><h1 class="text-2xl font-bold">Access denied</h1><p class="mut mt-2">${esc(u.email || u.username)} is not a super admin.</p><a class="btn-dark inline-block mt-4" href="#home">Back home</a></div></div>`);
  S.user = u; S.sa = S.sa || { tab: 'stores', q: '', stores: [] };
  try { await aapi('/a-check'); } catch (e) { return keyGate(e); }
  await saLoad();
}
function keyGate(e) {
  document.title = 'Super admin';
  app(`<div class="min-h-screen grid place-items-center p-6"><form id="kf" class="card2 p-6 w-full max-w-sm grid gap-3"><h1 class="text-xl font-bold">Enter your admin key</h1><p class="mut text-sm">${e.code === 'forbidden' ? 'This is the key you chose in deploy.html.' : 'Backend unreachable. Check WORKER_URL in app.js and that the worker is deployed.'}</p><input name="k" type="password" class="inp" placeholder="Admin key" required><button class="btn-dark">Unlock</button><a href="#home" class="text-sm mut text-center">Back home</a></form></div>`);
  $('#kf').onsubmit = ev => { ev.preventDefault(); try { localStorage.setItem('wsb_admin_key', new FormData(ev.target).get('k').trim()); } catch { } superAdmin(); };
}
async function saLoad() {
  try { const r = await aapi('/a-stores'); S.sa.stores = r.stores; Object.assign(SET, r.settings); } catch (e) { return keyGate(e); }
  saDraw();
}
function saRows() {
  const q = (S.sa.q || '').toLowerCase();
  const rows = S.sa.stores.filter(s => !q || (s.name + ' ' + s.slug + ' ' + (s.owner || '')).toLowerCase().includes(q)).sort((a, b) => b.createdAt - a.createdAt).map(s => `<tr><td><b>${esc(s.name)}</b><div class="mut text-xs">${esc(s.owner || '')}</div></td><td>${esc(s.mode)}</td><td><a class="underline" target="_blank" rel="noopener" href="?store=${esc(s.slug)}">${esc(s.slug)}</a></td><td><select data-chg="plan" data-s="${esc(s.slug)}" class="inp" style="width:auto;padding:.3rem .5rem"><option value="free" ${s.tier === 'pro' ? '' : 'selected'}>Free</option><option value="pro" ${s.tier === 'pro' ? 'selected' : ''}>Pro</option></select></td><td><span class="pill ${s.status === 'suspended' ? 'pro' : ''}">${esc(s.status)}</span></td><td>${s.orders}</td><td>${s.views}</td><td class="whitespace-nowrap"><button data-act="saedit" data-s="${esc(s.slug)}" class="btn-ghost">Edit</button> <button data-act="sasus" data-s="${esc(s.slug)}" class="btn-ghost">${s.status === 'suspended' ? 'Activate' : 'Suspend'}</button> <button data-act="sadel" data-s="${esc(s.slug)}" class="btn-ghost text-red-600">Delete</button></td></tr>`).join('');
  const b = $('#sa-body'); if (b) b.innerHTML = rows || '<tr><td colspan="8" class="mut">No stores match.</td></tr>';
  return rows;
}
function saDraw() {
  const st = S.sa.stores, tab = S.sa.tab, sum = f => st.reduce((a, s) => a + f(s), 0);
  document.title = 'Super admin';
  const stores = `<div class="grid grid-cols-2 sm:grid-cols-5 gap-3">${[['Stores', st.length], ['Pro', st.filter(s => s.tier === 'pro').length], ['Suspended', st.filter(s => s.status === 'suspended').length], ['Orders', sum(s => s.orders)], ['Views', sum(s => s.views)]].map(([a, b]) => `<div class="card2 p-4"><div class="mut text-xs">${a}</div><div class="text-2xl font-bold mt-1">${b}</div></div>`).join('')}</div>
  <input data-sq class="inp mt-5 max-w-sm" placeholder="Search by name, link or owner" value="${esc(S.sa.q)}">
  <div class="card2 mt-3 overflow-x-auto"><table class="t"><thead><tr><th>Store</th><th>Type</th><th>Link</th><th>Plan</th><th>Status</th><th>Orders</th><th>Views</th><th></th></tr></thead><tbody id="sa-body">${saRows()}</tbody></table></div>`;
  const b = SET.banner || {};
  const settings = `<form id="sf" class="card2 p-5 max-w-xl grid gap-4"><label class="text-sm">Platform name<input name="platformName" class="inp mt-1" value="${esc(SET.platformName)}" required maxlength="40"></label>
  <div class="grid gap-2"><label class="flex items-center gap-3 text-sm"><span class="sw"><input type="checkbox" name="bon" ${b.on ? 'checked' : ''}><i></i></span>Show announcement banner</label><input name="btext" class="inp" maxlength="240" placeholder="Announcement text" value="${esc(b.text)}"></div>
  <div class="grid grid-cols-2 gap-3"><label class="text-sm">Free plan item limit<input name="freeLimit" type="number" min="1" class="inp mt-1" value="${SET.freeLimit}"></label><label class="text-sm">Pro plan item limit<input name="proLimit" type="number" min="0" class="inp mt-1" value="${SET.proLimit}"><span class="text-xs mut">0 means unlimited</span></label></div>
  <label class="flex items-center gap-3 text-sm"><span class="sw"><input type="checkbox" name="signups" ${SET.signups !== false ? 'checked' : ''}><i></i></span>Allow new merchant sign-ups</label><button class="btn-dark">Save settings</button></form>`;
  app(`${bannerHTML()}<header class="border-b bd bg-white sticky top-0 z-20"><div class="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3"><b>${esc(SET.platformName)} · Super admin</b><span class="mut text-sm truncate hidden sm:block">${esc(S.user.email || S.user.username)}</span><a href="#dashboard" class="btn-ghost ml-auto">My dashboard</a><a href="#home" class="btn-ghost">Home</a><button data-act="sakey" class="btn-ghost">Lock</button></div><nav class="max-w-6xl mx-auto px-4 flex gap-1 pb-2">${[['stores', 'Stores'], ['settings', 'Site Settings']].map(([k, l]) => `<button data-act="satab" data-t="${k}" class="tab ${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav></header><main class="max-w-6xl mx-auto px-4 py-6">${tab === 'stores' ? stores : settings}</main>`);
  if (tab === 'settings') $('#sf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await aapi('/a-settings', { settings: { platformName: f.get('platformName'), banner: { on: f.has('bon'), text: f.get('btext') }, freeLimit: f.get('freeLimit'), proLimit: f.get('proLimit'), signups: f.has('signups') } });
      Object.assign(SET, r.settings); saDraw(); toast('Settings saved');
    } catch { toast('Could not save settings'); }
  };
}
ACT.satab = d => { S.sa.tab = d.t; saDraw(); };
ACT.sakey = () => { try { localStorage.removeItem('wsb_admin_key'); } catch { } superAdmin(); };
const saPatch = async (slug, patch, msg) => { try { await aapi('/a-update', { slug, patch }); toast(msg); await saLoad(); } catch { toast('Update failed'); } };
CHG.plan = t => saPatch(t.dataset.s, { tier: t.value }, `Plan set to ${t.value}`);
ACT.sasus = d => { const s = S.sa.stores.find(x => x.slug === d.s), off = s.status !== 'suspended'; if (confirm(off ? `Suspend "${s.name}"? Its page and ordering will be disabled.` : `Reactivate "${s.name}"?`)) saPatch(d.s, { status: off ? 'suspended' : 'active' }, off ? 'Store suspended' : 'Store reactivated'); };
ACT.sadel = async d => {
  const s = S.sa.stores.find(x => x.slug === d.s);
  if (!confirm(`Delete "${s.name}" and all its orders? This cannot be undone.`)) return;
  try { await aapi('/a-delete', { slug: d.s }); toast('Store deleted'); await saLoad(); } catch { toast('Delete failed'); }
};
ACT.saedit = d => {
  const s = S.sa.stores.find(x => x.slug === d.s);
  modal(`<form id="ef" class="grid gap-3"><h3 class="font-semibold text-lg">Edit ${esc(s.slug)}</h3><input name="name" class="inp" value="${esc(s.name)}" placeholder="Name" required><input name="tagline" class="inp" placeholder="Tagline (leave blank to keep)"><input name="domain" class="inp" placeholder="Custom domain, e.g. shop.example.com (optional)" value="${esc(s.domain || '')}"><div class="grid grid-cols-2 gap-2"><input name="wa" class="inp" value="${esc(s.wa)}" placeholder="WhatsApp number"><select name="currency" class="inp"><option value="">Currency (keep)</option>${['৳', '$', '₹', '€', '£', '₨', '¥'].map(c => `<option>${c}</option>`).join('')}</select></div><div class="grid grid-cols-2 gap-2"><select name="template" class="inp"><option value="">Template (keep)</option><option value="grid">Clean Grid</option><option value="list">Compact List</option><option value="editorial">Editorial Profile</option></select><select name="tier" class="inp"><option value="free" ${s.tier === 'pro' ? '' : 'selected'}>Free</option><option value="pro" ${s.tier === 'pro' ? 'selected' : ''}>Pro</option></select></div><select name="status" class="inp"><option value="active" ${s.status === 'active' ? 'selected' : ''}>Active</option><option value="suspended" ${s.status === 'suspended' ? 'selected' : ''}>Suspended</option></select><button class="btn-dark py-2.5">Save changes</button></form>`);
  $('#ef').onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), patch = {};
    for (const k in f) if (f[k] !== '') patch[k] = f[k];
    closeModal(); saPatch(d.s, patch, 'Store updated');
  };
};

/* ---------- boot ---------- */
window.addEventListener('hashchange', go);
loadSettings().then(go);
