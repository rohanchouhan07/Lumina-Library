> **ARCHIVED LEGACY DOCUMENT — Google Sheets / Apps Script.** The active app now uses Supabase Auth + PostgreSQL. Do not follow these old setup/API instructions for a new connection; use [SUPABASE-SETUP.md](SUPABASE-SETUP.md) instead. The historical Apps Script source and Google Sheet are retained untouched for reference/rollback.

---

# Lumina Library — final report

**Date:** 2026-10-23 · **Scope:** the addendum that moved the app onto a
React → Apps Script → Google Sheets architecture with real credential auth.

---

## 1. What was asked, and what exists

| Requirement | Status | Where |
| --- | --- | --- |
| Inspect the existing sheet, preserve tabs and records, document the mapping | **Done** — audited via the public `gviz` endpoint; mapping documented; nothing in the sheet was changed | `docs/SCHEMA-MAPPING.md` |
| Create missing tabs only | **Code written, not executed** — `Setup.gs → setupLumina()` creates only what is absent and appends only missing columns. Requires the owner to run it once | `google-sheets/backend/Setup.gs`, `SETUP-GOOGLE-SHEETS.md` §2 |
| React → Apps Script API → Google Sheets; no credentials or unrestricted writes in the browser | **Done** — one gateway (`apiClient`), one dispatcher (`Code.gs`), sheet access only inside Apps Script | `src/services/apiClient.ts`, `google-sheets/backend/Code.gs` |
| Design, animations, pages preserved | **Done** — no screen rebuilt; the login screen gained a credential form and the shell gained a connection state | `src/pages/LoginPage.tsx`, `src/components/auth/LiveLoginForm.tsx`, `src/components/layout/AppShell.tsx` |
| `/login` matches the product (email **or** institutional ID, show/hide, remember, loading, validation, animated entrance, logout) | **Done** | `LiveLoginForm.tsx`, `AppShell` profile menu |
| Roles `ADMIN \| FACULTY \| STUDENT`, normalised, read from the backend | **Done** — `normaliseRole_` + `mapRole`; role comes from `bootstrap.user.role` | `docs/ROLE-MATRIX.md` |
| Hashed passwords with per-user salt, active check, sessions, logout invalidation, admin-only admins, no self-registration, duplicate rejection, deactivated blocked, admin reset, no hashes in responses | **Done** — prototype-grade hashing (see limitations) | `AuthService.gs`, `MembersService.gs`, `docs/SECURITY.md` |
| Backend split into Auth/Books/Members/Loans/Reservations/Reports/Validation/Config (+ SheetDb, Settings, Wishlist, Setup) | **Done** — 14 `.gs` files | `google-sheets/backend/` |
| Actions for login/session/logout/profile/books/loans/issue/return/renew/reservations/stats/reports/settings/health; `{ok,data,error}` envelope | **Done** — 32 actions | `docs/API.md` |
| LockService on circulation, no negative availability, no double return, no duplicate reservations, validation, no stack traces | **Done** — and asserted in the contract suite | `LoansService.gs`, `Validation.gs`, `qa-tools/api-smoke.mjs` |
| Every mutation persists to the sheet; no `localStorage` authority; failed writes surface errors | **Done** — live writes re-read `bootstrap`; failures set `dataError` + toast + Retry banner; live mode no longer writes library data to `localStorage` | `LibraryProvider.tsx` |
| Sync: load on login, refresh after mutations, manual refresh, bounded periodic refresh, stale indicators, honest wording | **Done** — 2-minute poll (paused when hidden), “refreshes on each change”, no real-time claims | `AppShell`, `ConnectionPanel` |
| Deliverables (app, backend source, schema mapping, `.env.example`, setup guide, role matrix, API docs, test results, limitations, honest statement) | **Done** | `docs/*`, `SETUP-GOOGLE-SHEETS.md`, `.env.example` |

## 2. Architecture

```
Public pages / app UI
        │  (no fetch anywhere except services/)
        ▼
src/services/apiClient.ts  ── POST text/plain {action,payload,token} ──▶  Apps Script /exec
        │                                                                      │
   ApiError { code,message }                                                   ▼
        │                                                          Code.gs → dispatcher
        ▼                                                                    │
LibraryProvider (live)  ◀── bootstrap (role-scoped) ─── AuthService.requireSession_
        │                                                                    │
   React state shown in UI                                    *Service.gs → SheetDb → Google Sheet
```

* **One write path.** Mutations go `page → LibraryProvider → service → apiClient`; the
  provider then re-reads `bootstrap`, so the UI only ever shows what the sheet accepted.
* **One read path.** `bootstrap` is role-scoped on the server (`ALL` vs `SELF`), so a
  student's payload physically cannot contain other members' loans.
* **Server decides.** Availability, limits, duplicates, fines, reservations and role
  checks are all re-evaluated inside a `LockService` lock.

## 3. Decisions worth knowing

1. **Contract mock as the twin.** Because the live sheet belongs to the user, the API was
   developed against `qa-tools/mock-backend.mjs`, which implements the same actions,
   envelope and error codes. The React app, the smoke suite and the e2e suites all run
   against it. Pointing at a real deployment is a one-variable change.
2. **`text/plain` transport.** Apps Script cannot answer a CORS preflight, so the body is
   `text/plain` and the token rides in the JSON body. Documented in `docs/API.md`.
3. **Iterated HMAC-SHA256 instead of PBKDF2.** Apps Script exposes no PBKDF2/argon2. 12 000
   rounds with a per-user salt is the best available there, and it is **explicitly labelled
   prototype-grade** rather than called secure.
4. **`FACULTY` is the staff role.** The UI maps `FACULTY → faculty` and keeps a
   `librarian` demo seat offline. Archiving is how a title is retired; `books.delete`
   exists but the server refuses it (`CONFLICT`) as soon as a loan or open hold
   references the title, because deleting would orphan circulation history.
5. **Demo mode preserved.** With `VITE_API_BASE_URL` empty the app still runs the full
   seeded experience; a stored demo session is irrelevant in live mode and vice versa.
6. **Demo mode is the shipped default.** `VITE_API_BASE_URL` is empty in `.env.example`,
   so the app opens on the offline demo. Two dev servers are used side by side: port 5173
   (demo) and `npm run dev:mock` on port 5174 (`/api` → the mock on 8100). A real
   deployment sets the absolute `/exec` URL.

## 3b. The deployment is live

The backend is deployed on the owner's own Apps Script project and bound to the sheet:

```
https://script.google.com/macros/s/<YOUR-DEPLOYMENT-ID>/exec
```

**Verified against it (31 checks, all executed): 21 unauthenticated contract checks**
(health, ping, tab list, no id leak, CORS, envelope, forged token, malformed body, wrong
password not revealing whether an account exists, throttling) **and 10 in-browser checks**
(the app's own fetch reached `/exec` through Apps Script's `302 → googleusercontent.com`
redirect with no CORS failure, a wrong password surfaced the server's message in the form,
no token was stored, no console errors).

Also verified: seven protected actions called with no token all returned `UNAUTHORIZED`,
so authorisation runs before validation — an anonymous caller cannot probe the catalogue or
the policy. `setupLumina()` created exactly the seven tabs it promised and left `Sheet1`
with your `BK101` row; the sheet now holds `books:1, users:1` and nothing else.

**Also verified with the admin credentials** (password read from Script properties, never
committed): 21/21 authenticated read-only assertions; the browser signed in and rendered the
owner's data — dashboard aggregates, the `comic` category, the `BK101` "rohan" row in the
catalogue, the policy form showing `14` days / `₹5` per day / `2` renewals read from the
`Settings` tab (12/12 checks). The write run created, updated, issued, renewed, returned and
deleted rows on the live sheet, and proved the refusal paths (duplicate loan, double return,
delete with history, deactivating yourself). All `SMOKE-` rows were cleaned up afterwards;
one archived test title remains and is deletable by hand.

**Two real bugs were found by these runs and fixed in 2.1.1**, deployed, and (together with the librarian role) shipped in **2.2.0**, now the live version:
re-verified: blank `bookTitle`/`userName` in write responses, and a 25-second sign-in caused
by the 12 000-round hash. After the redeploy the live write sweep passed **66/66** and ran in
285 s instead of 955 s.

**Current state: the app now runs live on this machine.** `.env.local` points at the
deployment, so `npm run dev` (port 5173) signs you in against your Google Sheet. Measured
results after that switch:

| Suite | Result |
| --- | --- |
| Unauthenticated contract (`live-public-check`) | **21/21** |
| Authenticated read + write (`api-smoke`, live 2.2.0) | **72/72** — full write sweep against the deployed build, including the librarian permission block |
| Signed-in browser, read-only (`live-signed-in-check`) | **12/12** |
| **Browser → spreadsheet write** (`live-ui-write-check`) | **11/11** — a book added through the UI appeared in the sheet's own CSV view, then was deleted |
| Demo mode (`demo-e2e`, port 5176) | **10/10** |
| Mock mode (`live-e2e` / `live-admin-flow`, port 5174) | **19/19** / **12/12** |
| Backend logic (`gas-backend-test`) | **113/113** (adds 17 librarian + 7 password-rotation checks), **117/117** with the public-catalogue checks |
| Accounts & roles through the real screens (`roles-ui-check`, port 5174) | **19/19** — admin registers a librarian and a student, each signs in, guards hold, then a password is rotated and the old one stops working |
| **Live librarian creation** (`live-librarian-check`, :5173) | **16/16** — a real `LIBRARIAN` row created through the Members form, signed in, desk screens present, policy read-only, no console errors |
| **Live password rotation** (`live-password-rotation`) | **11/11** — `sessionsRevoked: 3`, caller's session alive, other session dead, old password refused, new one accepted, then rotated back |
| Public pages signed out (`public-catalogue-check`) | **8/8** on the mock (real catalogue), **7/7** on 2.2.0 (honest fallback) |
| Unit (`vitest`) + `tsc -b` + `npm run build` | **68/68** · clean · success |

Three modes ship side by side and the header always states which is active: **live** (5173),
**mock** (5174, `npm run dev:mock`), **demo** (5176, `npm run dev:demo`). A fresh clone has no
`.env.local`, so it defaults to Demo — nobody is told a backend exists until they configure
one.

**Left on the sheet by testing:** four archived `SMOKE-…` titles (they cannot be deleted
through the API because they have circulation history), and inactive `smoke.*@lumina.test`
accounts. Both are inert; delete the rows by hand for a pristine sheet.

## 4. Test evidence (all executed today)

| Suite | Result |
| --- | --- |
| `tsc -b` | clean |
| `npm run build` | success |
| `npm test` | **68/68** |
| `node qa-tools/api-smoke.mjs` (contract mock) | **63/63** |
| `node qa-tools/live-public-check.mjs` (**real deployment**) | **21/21** |
| `node qa-tools/live-deploy-check.mjs` (browser → **real deployment**) | **10/10** |
| `node qa-tools/gas-backend-test.mjs` (real `.gs` in a Node VM) | **86/86** |
| `node qa-tools/live-e2e.mjs` (connected UI) | **19/19** |
| `node qa-tools/live-admin-flow.mjs` | **12/12** |
| `node qa-tools/demo-e2e.mjs` (offline UI) | **10/10** |
| `node qa-tools/mobile-check.mjs` (375 px) | no overflow on login/dashboard/books/settings/reports/profile |

Details, including what was **not** run, are in `docs/TEST-RESULTS.md`.

## 5. Known limitations — read this before trusting it

1. **Write paths are unverified on the live deployment.** The deployment answers, enforces
   auth and throttles correctly (§3b), but no authenticated request has been made yet, so a
   sign-in success and a row written through the deployed function are still unproven. The
   app says *Demo mode* until then; it does not fake a connection.
2. **Prototype-grade auth.** Hand-rolled KDF, tokens in browser storage, sessions in a
   spreadsheet. Suitable for a college prototype, **not** for real student records without
   moving identity to a managed provider. Stated verbatim in the login screen and
   `docs/SECURITY.md`.
3. **Sync is polling, not real-time.** Sign-in, after each mutation, manual refresh and a
   two-minute interval while the tab is visible. Sheet edits made by hand appear after the
   next refresh.
4. **Apps Script limits.** ~6 min execution cap, cold starts of 2–4 s, and every request
   pays spreadsheet I/O. Fine for a library desk, not for a campus-wide concurrent load.
5. **Sheet = database.** Anyone with edit rights to the sheet can change any row, including
   a password hash. Share it with the deploying account only.
6. **Fines are simulated.** ₹5/day by default, recorded in the sheet, never charged; the
   UI labels them “simulated” on every screen.
7. **Self-checkout is off by default** (`allow_self_checkout=false`), so a student pressing
   *Borrow* gets a clear `FORBIDDEN` message until an admin enables it.
8. **No screen-reader verification**, no cross-browser run (Chromium only), no load test.

## 6. What you need to do to finish the connection

1. Create an Apps Script project bound to your sheet and paste either the single
   `google-sheets/LUMINA-APPS-SCRIPT.gs` bundle or the 13 files in
   `google-sheets/backend/` (`SETUP-GOOGLE-SHEETS.md` §1).
2. Set `SPREADSHEET_ID` / `SEED_ADMIN_EMAIL` in Script properties.
3. Run `setupLumina()` then `verifyLuminaSetup()`; collect the generated admin password.
4. Deploy ▸ Web app ▸ *Execute as me*, *Access anyone*; copy the `/exec` URL.
5. `VITE_API_BASE_URL=<exec url>` in `.env.local`, restart dev.
6. `API=<exec url> ADMIN_PASSWORD=… node qa-tools/api-smoke.mjs` → expect 63/63
   (read-only until you add `ALLOW_WRITES=1`).
7. Sign in as the admin, add a book, and check the row lands in the `Books` tab.

Steps 1–5 are done and independently verified (§3b). Steps 6–7 are the only remaining gap.
