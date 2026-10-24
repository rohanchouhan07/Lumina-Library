# Push this project to GitHub

Two things to know first:

1. **I cannot push for you.** This workspace has no GitHub account, no personal access token
   and no GitHub connector, so there is nothing I can authenticate with. Everything below is
   the part that needs *your* account — it takes about five minutes.
2. **The repository is already prepared.** `/home/user` is a git repository with a `.gitignore`
   that keeps `node_modules/`, `dist/`, `.env.local` and the screenshot folder out, and it has
   no secrets in it (verified by grep before committing). You do not need to sort out ignores.

---

## What is in the repo

```
/
├── lumina-library/          the React + TypeScript app
│   ├── src/                 pages, components, providers, services
│   ├── google-sheets/       the Apps Script backend (13 files) + LUMINA-APPS-SCRIPT.gs bundle
│   ├── docs/                API.md · ROLE-MATRIX.md · SCHEMA-MAPPING.md · SECURITY.md · TEST-RESULTS.md
│   ├── README.md · ACCOUNTS-GUIDE.md · DEPLOY-WALKTHROUGH.md · FINAL-REPORT.md
│   ├── .env.example         template — copy to .env.local, never commit the copy
│   └── package.json
├── qa-tools/                mock backend, api-smoke, gas-backend-test, browser suites
└── .github/workflows/pages.yml   optional: publishes the demo to GitHub Pages
```

`lumina-library/.env.local` — the file that points your machine at the live Apps Script
deployment — is **deliberately not committed**. Anyone who clones gets Demo mode (seeded data,
no server) until they create their own `.env.local`.

---

## Route 1 — git from this machine (recommended)

Do this in the workspace terminal, from `/home/user`.

### 1. Create an empty repository on GitHub

github.com → **+** → **New repository** → name it `lumina-library` → **Private** or Public →
**do not** tick "Add a README", ".gitignore" or a licence (they would conflict with the commit
that already exists) → **Create repository**.

### 2. Push

```bash
cd /home/user

# point the local repo at yours (replace YOUR-USERNAME)
git remote add origin https://github.com/YOUR-USERNAME/lumina-library.git

# make sure the branch is called main
git branch -M main

git push -u origin main
```

When git asks for a password, it will **reject your GitHub account password** — GitHub stopped
accepting those in 2021. Use a personal access token instead:

1. github.com → **Settings** → **Developer settings** → **Personal access tokens** →
   **Tokens (classic)** → **Generate new token** → scope **`repo`** → expiry 7 days.
2. Copy the token (`ghp_…`) and paste it **as the password** at the prompt.
3. Username: your GitHub username.

Alternative, if you would rather not handle a token:

```bash
# GitHub CLI: install, then authenticate in the browser once
gh auth login          # choose GitHub.com → HTTPS → "Login with a web browser"
gh repo create lumina-library --private --source=/home/user --remote=origin --push
```

Or with SSH, if you already have a key on GitHub:

```bash
git remote add origin git@github.com:YOUR-USERNAME/lumina-library.git
git push -u origin main
```

### 3. Check what went up

```bash
git ls-files | wc -l                 # ~185 files
git ls-files | grep -c node_modules  # 0
git ls-files | grep -c ".env.local"  # 0
```

---

## Route 2 — no git on your machine

There is a ready-made archive next to the workspace files:

* `lumina-library.bundle` — a full git history in one file. With git available anywhere:
  `git clone lumina-library.bundle lumina-library && cd lumina-library && git remote set-url origin https://github.com/YOU/lumina-library.git && git push -u origin main`
* `lumina-library-source.zip` — plain source, no history. On GitHub: **New repository** →
  then **uploading an existing file** → drag the unzipped contents in → **Commit changes**.
  (Do not upload the zip itself; GitHub would store it as a binary blob.)

---

## Optional — publish the demo with GitHub Pages

`.github/workflows/pages.yml` is included and ready:

1. Push the repo (above).
2. Repository → **Settings** → **Pages** → **Build and deployment → Source: GitHub Actions**.
3. Push any commit (or **Actions → Publish demo to GitHub Pages → Run workflow**).
4. The site appears at `https://YOUR-USERNAME.github.io/lumina-library/`.

The workflow builds in **Demo mode on purpose**: `VITE_API_BASE_URL` is empty, routing is
`hash` and the base path is relative, so `#/catalog` and friends work under `/<repo>/`. It also
runs `tsc -b` and `vitest` first, so a broken commit cannot go live.

**Why not publish the live version?** Two reasons, both real:

* A Vite build inlines every `VITE_*` value into the JavaScript. If the workflow built with your
  `.env.local`, your Apps Script `/exec` URL would be baked into a public bundle. That URL is not
  a secret in the way a password is — it still requires valid credentials — but there is no
  reason to advertise it.
* Apps Script Web Apps are not great as a public read API for an unknown audience: every visitor
  shares your daily quota, and the deployment runs as you.

If you *do* want the public site to talk to your sheet, fork the workflow and pass the URL
deliberately:

```yaml
        env:
          VITE_API_BASE_URL: ${{ vars.LUMINA_API_BASE_URL }}   # set in Settings → Variables
```

…and keep in mind that anyone can then reach your API endpoint and be invited to sign in.

---

## What must never be committed

| File | Why |
| --- | --- |
| `lumina-library/.env.local` | machine-specific backend URL; would also be baked into builds |
| any `.env` with real values | same |
| `node_modules/`, `dist/`, `dist-pages/` | rebuildable, huge |
| `qa-screens/` | local evidence screenshots, not source |
| anything containing an admin password | the account lives in the **spreadsheet**, not in this repo |

The `.gitignore` at the repository root already covers every row of that table, and the commit
was scanned for the admin password and for stored test credentials before it was made.

## Housekeeping you may want before publishing

* `qa-tools/` contains a few scratch scripts (`barcheck.mjs`, `chartcheck.mjs`, `dash-check.mjs`,
  `debug-*.mjs`) from earlier debugging. Harmless, but you can delete them for a tidier repo.
* `qa-tools/node_modules` is installed locally for Puppeteer and is ignored.
* The five archived `SMOKE-*` titles and inactive `smoke.*@lumina.test` accounts are in your
  **spreadsheet**, not in the repo — remove them in **Members** / the `Books` tab if you want a
  pristine demo.
