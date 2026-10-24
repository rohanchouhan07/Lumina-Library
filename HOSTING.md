# Run the live app somewhere you can open in any tab

The sandbox preview on port **5173** is only reachable through the Arena preview panel — the
raw host returns `403` because the sandbox requires a traffic token that only the panel
supplies. If you want a normal URL you can open in a new tab (or on your phone), pick one of
these.

---

## Option 1 — Vercel, straight from the GitHub repo (≈2 minutes, free)

Best fit: the repo is already pushed, `vercel.json` is included, and Vercel handles the SPA
rewrites so `/login`, `/catalog` and `/books/BK-0103` all work on refresh.

1. vercel.com → **Add New… → Project → Import Git Repository** → `rohanchouhan07/Lumina-Library`.
2. Configure:
   * **Root Directory**: `lumina-library` ← the app lives one level down
   * **Framework Preset**: Vite (auto-detected)
   * **Build Command**: `npm run build` · **Output Directory**: `dist`
3. **Environment Variables** → add:
   * `VITE_API_BASE_URL` = `https://script.google.com/macros/s/<YOUR-DEPLOYMENT-ID>/exec`
   * `VITE_API_TIMEOUT_MS` = `30000`
4. **Deploy.** You get `https://lumina-library-xxxx.vercel.app`.

That build talks to your real sheet — same login (`admin@gmail.com` / your password),
same data, same simulated fines.

## Option 2 — Netlify (same idea)

`netlify.toml` is included. netlify.com → **Add new site → Import an existing project** →
pick the repo → **Base directory** `lumina-library` → build `npm run build`, publish `dist` →
add `VITE_API_BASE_URL` under **Site settings → Environment variables** → Deploy.

## Option 3 — your own machine (private, no hosting account)

```bash
git clone https://github.com/rohanchouhan07/Lumina-Library.git
cd Lumina-Library/lumina-library
npm install
printf 'VITE_API_BASE_URL=https://script.google.com/macros/s/<YOUR-DEPLOYMENT-ID>/exec\nVITE_API_TIMEOUT_MS=30000\n' > .env.local
npm run dev          # → http://localhost:5173
```

Needs Node 20+. This is the only option where nobody else can reach the app.

## Option 4 — GitHub Pages (demo only, no backend)

Already wired in `.github/workflows/pages.yml`: repo → **Settings → Pages → Source: GitHub
Actions**. Publishes a **Demo-mode** build (seeded data, no Google Sheet, no password). Good for
showing the design; it will *not* sign in to your real data, on purpose.

---

## Before you publish the live version, decide this deliberately

Any static build **inlines `VITE_API_BASE_URL` into the JavaScript**, so a public deployment of
Option 1 or 2 shows the world:

* your Apps Script `/exec` URL (readable in the bundle, or in the browser's network tab), and
* a login screen anybody can attempt.

What still protects you: every action needs a valid session, passwords are salted and hashed
server-side, roles are enforced on the server, and Apps Script rate-limits per identifier. What
you give up: obscurity, plus your Apps Script daily quota is shared with everyone who finds the
page.

Practical middle ground: deploy it, and if you would rather not advertise the endpoint, keep the
repo private, share the Vercel URL only with the people who need it, and rotate the admin
password (Profile ▸ Password) before handing it out.

Verified locally before writing this: a production build made with the live URL serves
`/login` on a cold deep link, labels itself *Connected to Google Sheets*, and bounces an
unauthenticated `/app/books` to `/login` with no console errors.
