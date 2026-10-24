# Test results

Last run: **2026-10-23**, in this workspace. Every number below is from an executed
command, not an estimate. Anything not run is marked *not run*.

A real deployment now exists (see §3c): the unauthenticated surface and the browser
round trip are **verified against it**. Authenticated reads and writes still are not —
that needs the admin password from the deployment's Script properties.

---

## 1. Type check and build

| Command | Result |
| --- | --- |
| `npx tsc -b` | **clean** (0 errors, strict mode, no `any` escapes added) |
| `npm run build` | **success** — `dist/` produced, largest chunk 621 kB (178 kB gzip), charts split into their own chunk |

## 2. Unit suite — `npm test` (Vitest)

```
tests/engine.test.ts   26 passed
tests/storage.test.ts  14 passed
tests/sheets.test.ts   28 passed
Test Files  3 passed (3)
     Tests  68 passed (68)
```

Covers derived availability, borrowing eligibility, fine maths, reservation promotion and
expiry, analytics aggregates, storage validation/repair of corrupt data, and the legacy
CSV column mapping helpers.

## 3. API contract suite — `node qa-tools/api-smoke.mjs`

**63/63 passed** against `qa-tools/mock-backend.mjs` (the contract twin, port 8100).
Highlights — the negative cases matter more than the happy path:

| Area | Checks |
| --- | --- |
| Health / envelope | `health` responds; unknown action → `UNKNOWN_ACTION` |
| Auth | wrong password → `UNAUTHORIZED`; deactivated account → `FORBIDDEN`; sign-in by email **and** by institutional ID (`M-1004`); missing/invalid token → `UNAUTHORIZED`; logout revokes the token |
| Secrets | no `password`, `hash` or `salt` key in any response or in the activity log |
| Scoping | admin `bootstrap` → `scope: ALL`; student `bootstrap` → `SELF` with 1 user and only their own loans; analytics `LIBRARY` vs `SELF` |
| Authorisation | student blocked from `books.create`, `users.list`, `users.create`, `loans.return`, `settings.update` |
| Circulation | issue decrements availability (2/3 → 1/3); duplicate issue → `CONFLICT`; double return → `CONFLICT`; renewing a returned loan → `CONFLICT`; unknown book → `NOT_FOUND` |
| Catalogue | create/update; duplicate title → `CONFLICT`; delete refused with `CONFLICT` once a title has loan history, allowed for a never-borrowed title |
| Members | create; duplicate email → `CONFLICT`; deactivate → login `FORBIDDEN`; reactivate → login OK; admin cannot deactivate self |
| Holds / wishlist | create, duplicate → `CONFLICT`, cancel; wishlist toggle on→off |
| Settings | read for all, update admin-only |
| Injection | `=HYPERLINK(...)` and `+cmd` are stored with a leading `'` |

The suite is idempotent (unique suffixes per run), **read-only unless `ALLOW_WRITES=1`**,
and its cleanup archives the `SMOKE-<run>` title rather than deleting a row that has
history. It can be pointed at a real deployment:
`API=https://…/exec ADMIN_PASSWORD=… ALLOW_WRITES=1 node qa-tools/api-smoke.mjs`.

## 3b. Apps Script backend logic — `node qa-tools/gas-backend-test.mjs`

**86/86 passed.** This suite does not test a mock: `qa-tools/gas-harness.mjs` loads the
real `google-sheets/backend/*.gs` sources into a Node VM with faked `SpreadsheetApp`,
`PropertiesService`, `LockService`, `Utilities`, `ContentService` and `Session` objects,
seeded with a workbook that mirrors the live sheet (the 13 existing book columns plus the
`BK101` row), then calls `doPost`/`doGet` exactly as the browser does.

| Area | Checks |
| --- | --- |
| Setup | `setupLumina(true)` creates **nothing**; a real run creates only missing tabs; a second run changes nothing; `verifyLuminaSetup` passes its write probe |
| Your data | the legacy `Books` tab is reused (no duplicate tab); the 13 columns keep their order; the four new columns are appended on the right; `BK101`'s identity columns are byte-identical at the end of the run; the empty second tab is untouched |
| Auth | login by email and by institutional ID; wrong password → `UNAUTHORIZED`; eight failures → `RATE_LIMITED`, which then also refuses the correct password for the window; password stored as salt + iterated HMAC-SHA256 (2 000 rounds by default, up from 12 000 in <2.1.1 for latency reasons) and never returned; token stored hashed |
| Sessions | missing/garbage token → `UNAUTHORIZED`; logout revokes; deactivating a member kills their live session immediately |
| Roles | student blocked from `books.create`, `books.delete`, `users.list`, `users.create`, `settings.update`, `system.diagnostics`; faculty cannot create books or change policy, but gets library-scoped data |
| Circulation | issue decrements availability; duplicate issue → `CONFLICT`; double return → `CONFLICT`; renew a returned loan → `CONFLICT`; availability never negative; borrowing limit enforced |
| Holds | duplicate open reservation → `CONFLICT`; cancel; a student cannot cancel another member's hold, and can cancel their own |
| Catalogue | `books.delete` refused when loans or open holds exist, allowed for a never-borrowed title |
| Members | create/update/password reset; duplicate email and duplicate institutional ID → `CONFLICT`; admin cannot deactivate self |
| Hardening | `=HYPERLINK(…)` and `+cmd` stored with a leading `'`; malformed JSON body → `VALIDATION_ERROR`; failed requests logged with a code and **no** token, password or hash; 25 activity rows contain no secrets |
| Envelope | every handler result wrapped in `{ ok, data }` — the bug this suite caught |

This proves the **logic**. It cannot prove Google's runtime: quotas, OAuth, `/exec`
routing and real cold-start latency are only exercised by a deployment (§9).

## 3c. The live deployment — `node qa-tools/live-public-check.mjs`

Deployment under test (owner's own Apps Script project, bound to the sheet):

```
https://script.google.com/macros/s/<YOUR-DEPLOYMENT-ID>/exec
```

**21/21 passed**, unauthenticated and read-only:

| Area | Checks |
| --- | --- |
| Reachability | `GET ?action=health` → 200; `?action=ping` → `{pong:true}`; `?action=books.list` over GET → `UNKNOWN_ACTION` |
| Version | reports `2.1.0` — matches `Config.gs` in this repo |
| Setup | all seven logical tabs exist next to your existing `Sheet1`/`Sheet2`; counts `books:1, users:1` — your `BK101` row and the seeded administrator, nothing else |
| Leakage | the spreadsheet id never appears in a public response |
| Transport | `POST` with `text/plain` → 200; response carries `access-control-allow-origin: *`; a round trip took 3.4 s including a cold start |
| Envelope | `bootstrap` without a token → `UNAUTHORIZED`; a forged token → `UNAUTHORIZED`; unknown action → `UNKNOWN_ACTION`; malformed body → `VALIDATION_ERROR` (not a 500) |
| Auth errors | wrong sign-in → `UNAUTHORIZED` with *"Email/ID or password is incorrect."*, which does not reveal whether the account exists; no `hash`/`salt`/`token` string in the response |
| Throttling | repeated failures → `RATE_LIMITED` (tested on a non-existent identifier, so no real account was locked) |

Seven protected actions (`books.create`, `books.delete`, `loans.issue`, `users.list`,
`users.create`, `settings.update`, `system.diagnostics`) were also called with no token and
all returned `UNAUTHORIZED` — authorisation is checked **before** any validation or write,
so an anonymous caller cannot probe the catalogue or the policy.

### Browser, signed in — `node qa-tools/live-signed-in-check.mjs` (port 5173, live config)

**12/12** after switching the default dev server to the live backend: sign-in, dashboard with
live aggregates (*Total copies*, *Unique titles*), the `comic` category that exists only in
the sheet, the `BK101` "rohan" row in the catalogue, "connected to Google Sheets" in the shell
and the catalogue footer, the settings form populated from the `Settings` tab (`14` days,
`₹5`/day, `2` renewals, `Lumina Central Library`), the admin email on the profile, and no
console errors.

### Browser writes to the spreadsheet — `node qa-tools/live-ui-write-check.mjs`

**11/11** — the end-to-end proof that the UI writes real rows:

1. sign in on `localhost:5173` (live config), open **Books**;
2. **Add book** → fill the dialog → submit;
3. the dialog closes with no validation error;
4. the API returns the new title (`BK-0107`);
5. the **spreadsheet's own CSV view** shows the row;
6. the row is deleted again through the API (allowed: never borrowed).

Only a book row is created and removed — no member account, no loan.

### Deployed site vs deployed backend — `node qa-tools/live-public-verify.mjs`

**19/19** against `https://lumina-library-fawn.vercel.app` (bundle `index-Dw9nc9nh.js`,
commit `1d7f2d1`) with the API on **2.2.1**:

| Check | Result |
| --- | --- |
| backend answers `catalogue.public` | 15 titles · 64 copies · 64 available · 3 members |
| landing page, signed out, live state | reached it |
| landing counters | page `64 / 3 / 0 / 64` = API `copies 64, members 3, onLoan 0, available 64` |
| hero strip | "64 copies available today" |
| `/catalog` | 12 cards on screen, header "15 titles across 14 subject areas" = API total |
| `/books/BK-1008` | "Artificial Intelligence: A Modern Approach" by Stuart Russell — the row the API returns for that id |
| signed-out network | exactly one action fired, `catalogue.public`, no session token |
| payload leak scan | 25 835 chars: no emails, `userName`, `userId`, loan, fine, credential or settings field |
| anonymous access to session actions | `bootstrap`, `users.list`, `loans.list`, `reservations.list`, `settings.get`, `activity.list`, `system.diagnostics`, `users.me`, `books.list`, `reports.dashboard` → all `UNAUTHORIZED` |
| console errors | none |

The first run of this suite failed 7 checks; every one was a fault in the *suite*, not the site —
a throttled ground-truth `fetch` (now retried with backoff), counters read before
`AnimatedNumber` had run, and catalogue readiness keyed on button text instead of the cards'
`data-book-id`. Recorded here because "the test was wrong" is worth distinguishing from
"the product was wrong".

### Public pages while signed out — `node qa-tools/public-catalogue-check.mjs`

The owner reported the deployed site showing **0 titles / 0 copies** on the landing page and an
empty `/catalog`. Cause: the public pages read the same `bootstrap` payload as the app, which
needs a session — so a signed-out visitor got `emptyLibraryData()`.

Fix, in two parts:

* **2.2.1 adds `catalogue.public`** — one unauthenticated read returning title-level rows plus
  four counters (`titles`, `copies`, `available`, `onLoan`, `members`) and nothing personal;
* **the frontend degrades honestly** against older deployments: landing says *"Sign in to see
  live figures"*, `/catalog` shows a sign-in card, and a book deep link explains itself instead of
  claiming the title does not exist.

| Run | Result |
| --- | --- |
| `public-catalogue-check` against the mock (action present) | **8/8** — landing shows live counters, `/catalog` lists 8 titles, a `/books/:id` deep link resolves, no console errors |
| `public-catalogue-check` against the live 2.2.0 deployment (action absent) | **7/7** — the signed-out fallback, no zeros, no console errors |
| `gas-backend-test` (4 new public-catalogue checks) | **117/117** — answers without a token, leaks no member/circulation data, carries the counters, honours `search` |

Two UI bugs were also fixed while testing: the landing page claimed "derived from the seeded demo
dataset" while the public request was still in flight, and `/catalog` printed "0 titles across
seven subject areas" before the data arrived. Both now render an explicit loading state.

### Live 2.2.0, deployed build — the runs that matter

After the owner deployed 2.2.0 and rotated the admin password, these were run against the real
`/exec` and the real sheet:

| Suite | Result | What it proved |
| --- | --- | --- |
| `live-public-check` | **21/21** | envelope, 34 actions, auth-before-validation, no secrets, on `"version":"2.2.0"` |
| `api-smoke` (`ALLOW_WRITES=1 ALLOW_USER_WRITES=1`) | **72/72** | create/update/delete, issue/return/renew, duplicate + double-operation refusals, holds, wishlist, member create/deactivate, self-deactivation refusal, `=HYPERLINK` neutralised, secret-free log, plus the librarian block |
| `live-signed-in-check` | **12/12** | the sheet's own data in the UI, policy form from the `Settings` tab (`14` days, `₹5`, `2` renewals), admin account on the profile |
| `live-ui-write-check` (`API` + `SHEET_CSV` set) | **11/11** | a book added through the dialog, seen by the API **and** in the spreadsheet's CSV view, then deleted |
| `live-librarian-check` | **16/16** | `LIB-QA` created through **Members ▸ Register member ▸ Role: Librarian**, signs in, sees Members/Circulation/Reports, gets the *Admins only* policy card, can add books |
| `live-password-rotation` | **11/11** | `auth.changePassword` → `sessionsRevoked: 3`; caller's token survives, the sibling token answers `UNAUTHORIZED`, old password refused, new one accepted, then restored |

Two of my own mistakes are recorded here for honesty: running `live-ui-write-check` without
`API` and `SHEET_CSV` skips its verification **and** its cleanup, which left two `E2E-UI`
titles in the sheet — both were deleted through the API afterwards (`books.delete`, never
borrowed, so allowed), and the run was repeated properly. One leftover smoke student that was
still `ACTIVE` (`U-0002`) was deactivated.

### Accounts and roles through the UI — `node qa-tools/roles-ui-check.mjs` (port 5174)

**19/19**. This suite drives the actual screens instead of the API, on the local contract mock
where throwaway accounts are safe:

1. admin signs in and **Register member** → Role **Librarian** creates a desk account;
2. the dialog also creates a **Student**, and both appear in the members table with the right
   role badge and an initial-password field (live mode only);
3. the new librarian signs in with their institutional ID, sees Members / Circulation /
   Reports, and sees the **Admins only** card instead of the policy form;
4. the new student is shown *This area is restricted* on `/app/members`;
5. **Profile ▸ Password**: a mismatched confirmation is rejected in the browser, then a real
   rotation succeeds, the old password is refused and the new one works.

Two bugs were found and fixed by this suite: the mock seeded a duplicate `U-0005` (React
key collision that made member rows flicker in and out) and the librarian was missing the
`members.toggleStatus` permission even though `users.setStatus` allows it.

### Browser round trip — `node qa-tools/live-deploy-check.mjs`

**10/10 passed** against the real `/exec` URL in headless Chromium:

* the live sign-in screen renders (email/ID + password), and the demo role picker is absent;
* the page labels the authentication *prototype-grade* and does not call itself a demo;
* the browser's own request reached Apps Script (`302 → 200` via `script.googleusercontent.com`)
  and was **not** blocked by CORS;
* a wrong password surfaced the server's *"Email/ID or password is incorrect."* inside the
  form, the user stayed on `/login`, no token was written to storage, and there were no
  console errors.

Screenshot: `/home/user/qa-screens/live-deployment-login.png`.

### Authenticated runs against the live deployment

With the owner's `admin@gmail.com` credentials (password read from Script properties, never
committed):

| Run | Result |
| --- | --- |
| `api-smoke.mjs` read-only | **21/21 assertions** — sign-in, library-scoped bootstrap, diagnostics with no missing headers, settings readable + admin-editable, unknown policy keys rejected, activity log, logout revoking the token |
| `api-smoke.mjs` with `ALLOW_WRITES=1 ALLOW_USER_WRITES=1` | **66/66 — a clean sweep** on v2.1.1: create, update, delete (including the never-borrowed delete path), duplicate-title `CONFLICT`, issue, availability `2/3`, duplicate-loan refusal, renew, return with fine `0`, double-return `CONFLICT`, hold create/cancel/duplicate, the two new "title is present" assertions, wishlist toggles, member create + deactivate, self-deactivation refusal, `=HYPERLINK` neutralised, activity log secret-free, cleanup archiving the borrowed title |
| `live-signed-in-check.mjs` (browser) | **12/12** — sign-in, dashboard with live aggregates, the sheet's `comic` category, `rohan` (the owner's `BK101` row) in the catalogue, "connected to Google Sheets" in the shell and footer, policy form populated from the `Settings` tab (`14` days, `₹5`/day, `2` renewals), the admin email on the profile, no console errors |

### Two real bugs the live runs found (fixed in 2.1.1, deployed and re-verified)

1. **Blank titles in write responses.** `loans.issue`, `loans.return`, `loans.renew`,
   `reservations.create` and `reservations.cancel` passed empty lookup maps to their
   mappers, so `bookTitle`/`userName` came back `""`. The UI renders those fields straight
   from the response, so a freshly issued loan showed no title. Both suites now assert the
   join, and the harness fails if the maps are empty again (verified by reverting the fix:
   89/90).
2. **Sign-in exceeded the client timeout.** 12 000 hash rounds ≈ 25 s on Apps Script versus
   a 20 s request budget. The work factor is now 2 000 (~4 s), password calls get a 60 s
   budget, and stored hashes are re-hashed on next sign-in. Documented in `SECURITY.md`.
   After the redeploy the same write sweep took 285 s instead of 955 s.

Both fixes were confirmed on the redeployed script: `/exec?action=health` reports
`2.1.1`, the 66-check sweep passes, and the browser run confirms the title-bearing loan
and reservation responses.

### Google-side flakiness (not our code)

Roughly one request in ten came back as an HTML interstitial or with the body of a
*different* action; every case answered correctly when repeated. Both suites now retry
transient failures (reads freely; writes too, since the backend refuses duplicates) and
verify response shape before trusting it. Writes are never retried blindly: a lost
`books.create` response is reconciled by looking the title up before failing.

## 4. Browser end-to-end — connected mode — `node qa-tools/live-e2e.mjs`

**19/19 passed** against the React app on port 5174 (`npm run dev:mock`, `/api` proxied to
the contract mock). Port 5173 now runs against the live deployment, which is covered by the
two suites above; this one stays on the mock so the contract can be re-verified without
touching the owner's sheet.

| Check | Result |
| --- | --- |
| Login screen renders email/ID + password fields | pass |
| Demo role picker is absent in live mode | pass |
| Wrong password shows an error and stays on `/login` | pass |
| Admin sign-in lands on `/app` | pass |
| Shell reports “Google Sheets connected” | pass |
| Book created **through the UI** is present in the backend | pass (`BK-0014`) |
| Issue decrements availability and never goes negative | pass (`1/2`) |
| Reload keeps the session without a login flash | pass |
| Live mode never persists library records to `localStorage` | pass |
| Unchecked “keep me signed in” → token in `sessionStorage` only | pass |
| Another tab is not signed in by a tab-scoped session | pass |
| Student cannot call `users.list` | pass |
| Unauthenticated `bootstrap` → `UNAUTHORIZED` | pass |
| Sign-out returns to the public site | pass |
| Sign-out revokes the token server-side | pass |
| Guarded route redirects to `/login` when signed out | pass |
| No console errors during the flow | pass |

## 5. Browser end-to-end — admin flows — `node qa-tools/live-admin-flow.mjs`

**12/12 passed**

* Live mode asks for an initial password when registering a member.
* The registered account exists in the backend and can sign in with that password; a
  wrong password is rejected.
* No password hash or salt in the account payload.
* Editing an existing member keeps their institutional ID intact (it is never
  overwritten by the email), and they can still sign in with `M-1004`.
* A policy change (`fine_per_day` 5 → 7) is written to the backend and read back into
  the UI after a reload.

## 6. Browser end-to-end — demo mode — `node qa-tools/demo-e2e.mjs`

**10/10 passed** on the demo dev server (`npm run dev:demo`, port 5176,
`VITE_API_BASE_URL` forced empty — what a fresh clone gets):

* Public catalogue renders without signing in.
* Demo role picker shown; no password field.
* Admin reaches the dashboard; a new book is created and survives a reload
  (`localStorage` persistence).
* Student cannot reach `/app/members` (guarded, explanatory state).
* Sign-out returns to the public site; no console errors.

## 7. Responsive pass — `node qa-tools/mobile-check.mjs` (375 × 812)

Login, dashboard, books, settings, reports and profile: **no horizontal overflow**
(`scrollWidth == clientWidth == 375` on every screen, including the new password card).
The script auto-detects the mode, so it works against any of the three servers
(`BASE_URL` defaults to the mock on 5174; the demo picker is handled too).

## 8. Manual/visual pass

Screenshots captured for every authenticated screen in connected mode
(`/home/user/qa-screens/live/*.png`): dashboard, books, members, circulation,
reservations, reports, settings, profile — rendered with real backend data, charts
included, no layout breaks.

---

## 8b. Landing feature previews — `node qa-tools/feature-previews-check.mjs`

The six-panel showcase on `/` used to fall back to grey skeleton bars for five of its six
variants. Each panel now renders a finished mini-interface; five of them are built from the
fictional `SAMPLE_*` arrays in `src/components/landing/FeaturePreviews.tsx` and say so, and
only the catalogue panel quotes the public API (titles, shelves and copy counts — never a
member, loan or fine).

| Width | Tabs | Assertions |
| --- | --- | --- |
| 1440 × 1000 | 6 | panel renders, expected content present, no pulse skeletons, sample/live label, nothing clipped inside the panel, no horizontal page overflow |
| 820 × 1180 | 6 | same |
| 390 × 844 | 6 | same |
| 1280 × 900, `prefers-reduced-motion: reduce` | 6 | panel fully rendered (no half-drawn bars), nothing clipped, no horizontal overflow |

Result: **97/97** (6 tabs × 5 assertions × 3 widths + 6 reduced-motion assertions + console-error check),
with zero console errors while switching features. Screenshots land in `/home/user/qa-screens/preview-*.png`.

## 9. Not run (and why)

| Item | Status |
| --- | --- |
| Authenticated actions on the **live deployment** | **not run** — needs `ADMIN_PASSWORD` from the deployment's Script properties. §3c proves the unauthenticated surface and the browser transport against the real URL; §3b proves the logic; §3 proves the contract. The join of all three (a signed-in user writing a row through the deployed function) is still untested. |
| Creating the new tabs in the real spreadsheet | **not run** — needs the same deployment step (`setupLumina()`). The sheet has not been modified by this work. |
| Load/performance testing | not attempted; Apps Script cold start (~2–4 s first call) is the known cost. |
| Cross-browser | Chromium only (headless Chrome via Puppeteer). |
| Screen-reader audit | accessibility is implemented (landmarks, focus trapping, `aria` on custom widgets, reduced-motion) but has not been verified with a real screen reader. |
