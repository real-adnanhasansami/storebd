# StoreBD — WhatsApp Storefront & Booking SaaS

Static frontend (HTML, Tailwind CDN, vanilla JS) on GitHub + Cloudflare Pages. Backend: one **Puter Worker** plus Puter auth, kv and fs. No servers to run.

## Files
| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app (landing, storefronts, merchant dashboard, super admin) |
| `worker.js` | Backend API (orders, views, registry, admin) |
| `deploy.html` | One-page tool that deploys `worker.js` to your Puter account |

## Deploy (about 10 minutes)

### 1. Push to GitHub
Create a repo and push all files to the root.

### 2. Host on Cloudflare Pages
Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → select the repo. Build command: *(empty)*. Output directory: `/`. Deploy. Routing uses `#home`, `#dashboard`, `#super-admin` and `?store=slug`, so there are no 404s.

### 3. Deploy the Puter Worker
1. Open `https://<your-project>.pages.dev/deploy.html`.
2. Keep the generated **admin key** (or paste your own, 16+ characters) and save it in a password manager.
3. Click **Sign in and deploy**, using the Puter account that should own all platform data.
4. Copy the **Worker URL** it prints (default `https://wsb-api.puter.work`).

The admin key is injected at upload time, so it is never committed to GitHub.

### 4. Point the app at the worker
In `app.js` edit the top `CFG`:
```js
SUPER_ADMINS: ['adnansite01@gmail.com'],      // Puter email or username allowed into #super-admin
BASE_URL: 'https://pages.dev',                // origin used in shareable links and QR codes
WORKER_URL: 'https://wsb-api.puter.work',     // from step 3
```
Commit and push. Cloudflare redeploys automatically.

### 5. First run
1. Open `#super-admin`, sign in with Puter, then enter the admin key once (kept in that browser; **Lock** clears it).
2. Open `#dashboard` in another account to create a test store, place an order from `?store=<slug>`, and watch it appear in both panels.

To change `worker.js` later, run `deploy.html` again with the same worker name; it replaces the old version.

## What the worker does
- **Orders and bookings**: customers do not need a Puter account. The storefront posts the order to the worker, then opens WhatsApp. Orders are stored per store and shown in the merchant dashboard with status tags.
- **Views**: counted once per customer session per store.
- **Registry**: every new store registers with the worker, so link names are unique platform-wide and the super admin sees all stores automatically.
- **Security**: each store gets a private owner key (kept in the merchant's own Puter kv) required for dashboard reads and writes. Admin actions require the admin key. Public endpoints only return the store snapshot and settings.

## Super Admin (`#super-admin`)
- **Stores**: all stores with plan, status, orders, views and search. Edit (name, tagline, WhatsApp, currency, template, plan, status), Suspend/Activate, Delete (removes the store and its orders).
- **Site Settings**: platform name, announcement banner, Free and Pro item limits (`0` = unlimited), and a switch to open or close new sign-ups.
- Custom domains: set a store's domain in **Edit** and its shareable link and QR code use `https://<domain>/?store=<slug>` instead of `BASE_URL`.
- Suspended stores show an "unavailable" page and reject orders. Edits made by the admin win over the merchant's last saved copy.

## Notes and limits
- Product images still live in each merchant's own Puter storage and are served from `https://wsb-<slug>.puter.site`. Deleting a store removes its data from the platform but not those image files.
- All platform data is stored in the worker owner's Puter kv, so Puter's storage and rate limits apply.
- Anyone can post an order to a public store, as with any public checkout form. The worker validates and size-limits input, but it has no CAPTCHA or rate limiting.
- If the worker is unreachable, storefronts fall back to the last published static snapshot, and orders are kept in the customer's browser only.
