# Lumina Library

**Discover Knowledge. Manage Smarter.**

A premium, animated **college library management system**: a cinematic public site plus a working
operational dashboard for administrators, faculty and students — backed by a **Google Sheet through an
Apps Script API**, with an offline demo mode when no backend is configured.

- **Public catalogue** — signed-out visitors read titles and availability through one dedicated
  action (`catalogue.public`) that returns no member data; if a deployment predates it, the pages
  say "sign in to see live figures" instead of printing zeroes.
- **Connected mode** — sign in with an email/institutional ID and password, everything reads from and
  writes to the spreadsheet, roles are issued by the server.
- **Demo mode** — no backend configured: seeded sample data in `localStorage`, role cards instead of
  credentials. Nothing leaves the browser.

The same UI, animations and pages run in both modes.

---

## Quick start

```bash
cd lumina-library
npm install
npm run dev        # http://localhost:5173
```

Demo mode is the default (`VITE_API_BASE_URL` empty): pick a role card, no password needed.

To run against a backend:

```bash
cp .env.example .env.local
# VITE_API_BASE_URL=https://script.google.com/macros/s/XXXX/exec
npm run dev
```

See **[SETUP-GOOGLE-SHEETS.md](SETUP-GOOGLE-SHEETS.md)** for deploying the Apps Script backend.

### The three modes

One codebase, three honest modes — the app never pretends to be connected when it is not.
The header always says which one is live: *Google Sheets connected*, *local mock*, or *Demo mode*.

| Mode | How to start | Where data lives | Sign-in |
| --- | --- | --- | --- |
| **Live** (this machine, default) | `npm run dev` — needs `VITE_API_BASE_URL` in `.env.local` | your Google Sheet, via the deployed Apps Script Web App | email/ID + password, verified server-side |
| **Mock** | `npm run dev:mock` (start `../qa-tools/mock-backend.mjs` first) | in-memory contract twin on :8100 | same credentials, same contract |
| **Demo** | `npm run dev:demo`, or delete/empty `.env.local` | `localStorage` in the browser | pick a role, no password |

`.env.local` is git-ignored, so a fresh clone gets **Demo** by default and nobody is told a
backend exists. Only non-secret values belong there — the `/exec` URL is public; a password
never is.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 — **live** when `.env.local` sets `VITE_API_BASE_URL`, otherwise Demo mode |
| `npm run dev:mock` | Same app on port 5174 with `/api` proxied to the local contract mock (no Google account needed) |
| `npm run dev:demo` | Same app on port 5176 with the backend forced off — the offline demo |
| `npm run build` | `tsc -b` then production build into `dist/` |
| `npm run preview` | Serve the production build (port 4173) |
| `npm run typecheck` | TypeScript project check only |
| `npm test` | Vitest unit suite (68 tests) |
| `npm run test:api` | 71-check API contract suite (incl. librarian + password-rotation rules) — read-only against a real deployment until `ALLOW_WRITES=1` |
| `npm run test:backend` | 113 checks that run the real Apps Script sources in a Node VM |
| `npm run backend:bundle` | Regenerate `google-sheets/LUMINA-APPS-SCRIPT.gs` (paste-once deploy) |
| `node ../qa-tools/live-e2e.mjs` | Browser e2e against the connected-mode UI (`BASE_URL=` to pick a port) |

---

## Accounts and roles

Four roles, normalised on both sides — `ADMIN`, `LIBRARIAN`, `FACULTY`, `STUDENT` in the sheet/API,
`admin`/`faculty`/`student` in the UI. **The role is read from the backend on every request**; the client
never decides who you are. Full matrix: **[docs/ROLE-MATRIX.md](docs/ROLE-MATRIX.md)**.

| Role | Can do |
| --- | --- |
| **Administrator** | Everything: catalogue CRUD/archive/delete, members and accounts, circulation for anyone, full analytics, policy, diagnostics |
| **Librarian** | The desk: inventory, register/edit members (not administrators), issue/return/renew for anyone, holds, reports, activity log — no policy, no diagnostics |
| **Faculty** | Catalogue, own borrowing and renewals, holds, wishlist, own analytics, preferences |
| **Student** | Catalogue, own borrowing, holds, wishlist, personal dashboard, preferences — only ever their own records |

Accounts are created by an administrator; there is **no public sign-up**. In demo mode the same three
experiences are reachable from role cards (and “Switch demo role” in the profile menu).

Seed accounts used by the contract mock and the e2e suite:
`admin@lumina.edu / Lumina@2026`, `faculty@lumina.edu / Faculty@2026`,
`student@lumina.edu / Student@2026` (institutional ID `M-1004`).

---

## Two data modes

| | Connected (live) | Demo |
| --- | --- | --- |
| Backend | Apps Script Web App → Google Sheet | none |
| Sign-in | email or institutional ID + password | role cards |
| Authority | the spreadsheet | `localStorage` (demo data only) |
| After a mutation | re-reads `bootstrap`, so the UI shows what the sheet accepted | writes to storage, then state |
| Refresh | on sign-in, after every change, manual, + 2-minute poll | storage events |

Failed writes are never swallowed: the action returns `{ ok: false, error }`, the toast says what failed,
and a banner in the header offers **Retry**. Nothing in the UI claims real-time sync — it says
"refreshes on each change".

---

## Routes

**Public** — `/`, `/catalog`, `/books/:id`, `/login`

**Authenticated** — `/app` (role-specific dashboard), `/app/books`, `/app/members` *(admin)*,
`/app/loans`, `/app/reservations`, `/app/reports` *(admin, faculty)*, `/app/profile`, `/app/settings`

Guarded routes show an explanatory "This area is restricted" state; signed-out visitors land on
`/login`, and a stored session is verified against the backend before any screen renders.

---

## Features

### Catalog & inventory
- 41 seeded titles across 7 categories, with generated cover artwork (procedural SVG — no external images).
- Search across title, author, ISBN, category, shelf and tags; category/availability filters; four sort modes.
- Grid and list views, incremental loading, empty/no-result states.
- **Availability is derived**: `available = totalCopies − activeLoans`. It is never stored or hand-edited.
- Copy counts cannot be reduced below the number of active loans; deleting a title with circulation
  history is blocked and the UI steers you to **archive** instead, so history stays intact.

### Circulation
- Issue workflow validates membership status, available copies, per-role borrowing limits, duplicate copies
  and (optionally) unpaid-fine thresholds before a loan is created.
- Return workflow calculates overdue days and the simulated fine, marks the loan returned and frees a copy.
- Renewal is blocked when the renewal limit is reached, the loan is overdue, or another member is waiting.
- Every successful mutation updates dashboard metrics, availability and the activity log atomically.
- Fines: **₹5 per overdue day by default** (configurable), zero for on-time returns, accruing for active loans.
  All fines are clearly labelled **simulated demo values**.

### Reservations (documented policy)
1. A `ready` hold whose hold window elapses becomes `expired`.
2. While a title has free copies, the **oldest pending** hold is promoted to `ready` with a hold window
   (`reservationHoldDays`, default 3 days).
3. A ready hold is `fulfilled` when that member borrows the title.
4. Duplicate active holds by the same member for the same title are prevented.

### Members
- Searchable/filterable table (role, status, department) with a responsive card list on mobile.
- Add/edit with validation (unique email and institutional ID, valid email format, sane borrowing limit);
  in connected mode an initial password is required and hashed server-side.
- Activate/deactivate (blocked while the member still has books on loan), detail drawer with current loans,
  borrowing history, active holds, queue position and outstanding simulated fines.

### Account
- **Profile ▸ Password** changes your own password against the live backend: current password required,
  minimum 8 characters with a letter and a number, confirmation must match. Every other session for the
  account is signed out; this browser stays signed in. In demo mode the card explains that there is no
  server, instead of showing a form that cannot work.

### Analytics
- Monthly issue/return trends, category mix, overdue trend, membership growth, most-borrowed titles,
  availability breakdown and loan-status split — all computed from live state via Recharts.
- Date-range (3/6/12 months) and category filters; explicit no-data states; screen-reader summaries.
- CSV export for inventory, members, circulation and reservations (RFC-style escaping of `,` `"` newlines),
  using the currently filtered rows where applicable.

### UX, motion & accessibility
- Framer Motion throughout: staggered hero reveal, scroll-triggered sections, parallax book composition
  (pointer-driven, disabled on touch and with reduced motion), animated counters, page transitions,
  sliding sidebar indicator, animated dialogs, toasts, progress bars and chart entrance animations.
- Respects `prefers-reduced-motion` **and** an in-app motion preference (stored per member).
- Semantic landmarks, skip-to-content links, focus trapping + restore in dialogs, `aria` labelling on custom
  comboboxes/tabs/switches, visible focus rings, status conveyed with text + icon (never colour alone).
- Fully responsive at 375 / 768 / 1024 / 1440 px (verified — see Testing), no horizontal page overflow.

### Data & resilience
- Central `storage.ts` service: typed read, write, seed, reset, session handling.
- Parsed data is **validated and repaired** on load (orphan loans/reservations dropped, impossible
  availability corrected, invalid config coerced). Corrupt JSON is backed up then reseeded.
- Writes go to storage *before* React state, so a failed save never desynchronises the UI.
- Same-tab and cross-tab consistency (storage events), a Reset Demo Data action with confirmation, and a
  logout that clears the session but deliberately keeps the dataset.

---

## Technology

React 19 · TypeScript (strict) · Vite 7 · Tailwind CSS v4 · Framer Motion · React Router 7 ·
Lucide · Recharts · React Hook Form + Zod · date-fns · Vitest
Backend: Google Apps Script (V8) + Google Sheets, deployed as a Web App.

---

## Project structure

```
lumina-library/
  src/
    app/            App.tsx · router.tsx (guards) · providers.tsx
    components/
      auth/         LiveLoginForm (identifier + password, show/hide, remember)
      animation/    Reveal, Stagger, AnimatedNumber, usePointerParallax
      books/        BookCover (procedural SVG), BookCard, BookFormDialog, detail panel
      circulation/  IssueDialog, ReturnDialog, StatusBits, ActivityFeed
      charts/       ChartKit (Recharts wrappers, tooltips, empty states)
      dashboard/    Admin / Faculty / Student dashboards, StatCard
      landing/      SiteHeader, SiteFooter, PublicLayout
      layout/       AppShell (connection state, sync banner), PageHeader, GlobalSearch
      members/      MemberFormDialog (initial password in live mode), MemberDetailDialog
      profile/      PasswordPanel (change password, revokes other sessions)
      settings/     PreferencesPanel, ConnectionPanel (health probe + refresh)
      ui/           Button, Badge, Card, Field, Dialog, Table, Tabs, Menu, Switch,
                    Combobox, Avatar, Feedback
    config/         env.ts — public VITE_* configuration (no secrets)
    data/           seedData.ts — demo dataset used only when no backend is configured
    features/
      library/      engine.ts — domain logic (availability, eligibility, fines, holds)
      sheets/       legacy CSV helpers, kept for their unit tests; not mounted at runtime
    hooks/          useCatalog, useAnalytics
    lib/            storage.ts, permissions.ts, validation.ts, dateUtils.ts, exportUtils.ts
    pages/          Landing, Login, Catalog, BookDetails, Dashboard, Books, Members,
                    Loans, Reservations, Reports, Profile, Settings
    providers/      LibraryProvider (data, live mutations, refresh), AuthProvider, ToastProvider
    services/       apiClient.ts, mappers.ts, authService, booksService, usersService,
                    loansService, reservationsService, reportsService, settingsService,
                    wishlistService
    types/          domain models + types/api.ts (the API contract)
  google-sheets/
    backend/        Apps Script source to deploy (Config, Validation, SheetDb, AuthService,
                    BooksService, MembersService, SettingsService, LoansService,
                    ReservationsService, ReportsService, WishlistService, Setup, Code)
    LUMINA-APPS-SCRIPT.gs  generated paste-once bundle of all 13 files (do not edit)
    build-bundle.mjs        regenerates the bundle
    .clasp.json.example     clasp push setup for the per-file route
  docs/             API.md · SCHEMA-MAPPING.md · ROLE-MATRIX.md · SECURITY.md · TEST-RESULTS.md
  <repo>/qa-tools/  mock-backend.mjs · api-smoke.mjs · gas-harness.mjs · gas-backend-test.mjs ·
                    live-e2e.mjs · live-admin-flow.mjs · demo-e2e.mjs · mobile-check.mjs ·
                    roles-ui-check.mjs (create librarian/student + rotate a password via the UI) ·
                    live-librarian-check.mjs · live-password-rotation.mjs (against the real sheet)
```

Design principles:

- **One write path per mode.** Connected mode: `services/* → apiClient → Apps Script → sheet`, then a
  re-read. Demo mode: `LibraryProvider.commit → lib/storage.ts`. No component ever writes storage or calls
  `fetch` directly.
- **Server decides.** Roles, availability, fines, eligibility and duplicates are all re-checked in Apps
  Script; `lib/permissions.ts` only hides controls.
- **Pure domain logic.** `features/library/engine.ts` holds the rules the UI needs for previews and
  validation, unit-tested in `tests/engine.test.ts`.

---

## Documentation

| File | Contents |
| --- | --- |
| [SETUP-GOOGLE-SHEETS.md](SETUP-GOOGLE-SHEETS.md) | Deploy the Apps Script backend, initialise tabs, connect the frontend |
| [docs/API.md](docs/API.md) | Transport, envelope, error codes, every action with payload/permissions |
| [docs/SCHEMA-MAPPING.md](docs/SCHEMA-MAPPING.md) | Sheet audit, tab/column ↔ API field ↔ TS type mapping |
| [docs/ROLE-MATRIX.md](docs/ROLE-MATRIX.md) | Capability and route matrix for the three roles |
| [docs/SECURITY.md](docs/SECURITY.md) | What is enforced, what is prototype-grade, deployment checklist |
| [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md) | Every suite, what it covers, and the numbers from the last run |
| [FINAL-REPORT.md](FINAL-REPORT.md) | Summary of the work, decisions, and known limitations |

---

## Status and limitations

- The app is a **prototype**: real hashing and server-side session validation, but a hand-rolled KDF on
  Apps Script. Not production identity — see `docs/SECURITY.md`.
- Fines are **simulated** (₹5/day by default) and never charged; the UI labels them as such everywhere.
- Sync is **polling**, not real-time: sign-in, after each mutation, manual refresh, two-minute interval.
- The connected mode has been verified end-to-end against the **contract mock** (`qa-tools/mock-backend.mjs`),
  not yet against a live deployment — that requires the owner to deploy `google-sheets/backend/` and set
  `VITE_API_BASE_URL` (see the setup guide).
