# StoreBD — WhatsApp Storefront & Booking SaaS (100% Cloudflare)

Frontend: HTML + Tailwind CDN + vanilla JS. Backend: **Cloudflare Pages Functions + D1**. No Puter, no external servers.

## Files
| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `functions/api/[[path]].js` | Backend API (runs on the same domain, so no CORS) |
| `schema.sql` | D1 database tables |

## Setup (about 10 minutes)

1. **GitHub**: push these files to your repo root, keeping the `functions/` folder. If the repo has `worker.js` or `deploy.html` from the Puter version, delete them.
2. **Create the database**: Cloudflare dashboard → *Storage & Databases → D1 → Create database* (name it `storebd-db`). Open its **Console** tab, paste all of `schema.sql`, and run it.
3. **Bind it to your Pages project**: *Workers & Pages → storebd → Settings → Bindings → Add → D1 database*. Variable name must be exactly `DB`; pick `storebd-db`. Add it for Production (and Preview if you use it).
4. **Add variables**: *Settings → Variables and Secrets → Add*:
   - `SESSION_SECRET` (type **Secret**): any random string of 32+ characters.
   - `ADMIN_EMAILS` (plain text): `adnansite01@gmail.com` (comma-separate for more admins).
5. **Redeploy**: *Deployments → ⋯ → Retry deployment* (or push a new commit). Variables and bindings apply only to new deployments.
6. **Become super admin**: open the site, click **Create Your Free Page**, and sign up with the admin email **before sharing the link with anyone**. Emails are not verified, so whoever registers an admin email first gets the admin role. Then open `/#super-admin`.

## What you get
- **Merchants**: email and password accounts, one page each, with Grocery, Clinic and Services modes, 3 templates, image uploads, order and booking log with status tags, QR code and store link.
- **Customers**: no account needed. Orders, bookings and inquiries are saved to D1 and then sent to WhatsApp. Views are counted once per session.
- **Super admin** (`/#super-admin`): all stores listed automatically, with edit, plan change, suspend and delete, plus Site Settings (platform name, banner, Free/Pro limits, sign-up switch).
- **Links**: `?store=slug` on `BASE_URL` in `app.js` (set to `https://storebd.pages.dev`). A store's custom domain, set in the admin Edit form, overrides it for that store's link and QR code.

## Notes and limits
- Images are resized in the browser and stored in D1 (max 150 per store). For heavy use, move them to R2.
- No email verification, password reset or login rate limiting yet. Turn on Cloudflare Turnstile or WAF rate-limit rules on `/api/login` and `/api/signup` before heavy public use.
- Item limits are enforced on the server, using the Free and Pro limits from Site Settings.
- Free plan: D1 and Pages Functions free quotas apply (generous for starting out).
