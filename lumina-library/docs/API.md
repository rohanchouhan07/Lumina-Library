> **ARCHIVED LEGACY API DOCUMENT — Apps Script v2.2.1.** The current frontend uses `supabase.rpc('lumina_api', …)` and Supabase Auth. See [SUPABASE-SETUP.md](../SUPABASE-SETUP.md) for the active setup.

---

# Lumina Library — API reference (Apps Script backend v2.2.1)

The browser never talks to Google Sheets directly. It posts a single JSON body to the
Apps Script Web App URL, which validates the session, applies the mutation inside a
`LockService` lock, writes to the spreadsheet, and returns a JSON envelope.

```
React (Vite)  ──POST text/plain──▶  Apps Script Web App  ──▶  Google Sheet
    ▲                                       │
    └────────── { ok, data } / { ok, error } ┘
```

---

## 1. Transport

| Property | Value |
| --- | --- |
| Method | `POST` |
| URL | Apps Script Web App `/exec` URL (`VITE_API_BASE_URL`) |
| `Content-Type` | `text/plain;charset=utf-8` — keeps the call a CORS "simple request", so no preflight is needed (Apps Script cannot answer `OPTIONS`) |
| Body | `{ "action": "books.list", "payload": { … }, "token": "<opaque session token>" }` |
| Redirects | Apps Script answers `302`; `fetch` follows it automatically |
| Timeout | `VITE_API_TIMEOUT_MS` (default 20 000 ms), enforced with `AbortController` |

The token travels in the body, not in an `Authorization` header, for the same
preflight-avoidance reason. It is opaque and hashed at rest in the `Sessions` tab.

### Response envelope

```json
{ "ok": true, "data": { … } }
```

```json
{ "ok": false, "error": { "code": "CONFLICT", "message": "No copies are available. Place a reservation instead." } }
```

Error codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`RATE_LIMITED`, `SERVER_ERROR`, `CONFIG_ERROR`, `UNKNOWN_ACTION`.

`message` is written for a person, is safe to show in a toast, and never contains a
stack trace, SQL, sheet name, token or hash. The client maps codes to copy in
`src/services/apiClient.ts` (`describeApiError`), and `RETRIABLE` in
`src/types/api.ts` marks which ones are worth a retry button
(`NETWORK_ERROR`, `TIMEOUT`, `RATE_LIMITED`, `SERVER_ERROR`). The client also raises
`NOT_CONFIGURED` locally when `VITE_API_BASE_URL` is empty, and `MALFORMED_RESPONSE`
when `/exec` returns HTML — usually a Google sign-in page, which means the deployment's
access setting is wrong.

`data` is always fully materialised JSON — never a Spreadsheet object, `Date` or `Error`.

---

## 2. Actions

`Auth` column: `—` public, `S` any signed-in session, `A` admin only, `A/L` admin or
librarian. Role rules are enforced server-side in `AuthService.requireRole_`; the client
mirrors them only to hide controls.

Roles are `ADMIN`, `LIBRARIAN`, `FACULTY`, `STUDENT`. A librarian runs the desk — inventory,
members, circulation, holds — but cannot change policy, read diagnostics, or manage an
administrator account. See `docs/ROLE-MATRIX.md`.

### Session

| Action | Auth | Payload | Data |
| --- | --- | --- | --- |
| `health` | — | `{}` | `{ service, version, tabs, counts, time }` |
| `catalogue.public` | — | `{ search?, category? }` | `{ books, total, stats:{titles,copies,available,onLoan,members}, serverTime }` — the only signed-out read; title-level fields and four counters, no member data |
| `auth.login` | — | `{ identifier, password, remember? }` | `{ token, user, expiresAt }` |
| `auth.session` | S | `{}` | `{ user }` |
| `auth.logout` | S | `{}` | `{ loggedOut: true }` |
| `auth.changePassword` | S | `{ currentPassword, newPassword }` | `{ changed: true, sessionsRevoked }` — every other session for that account is revoked; the caller's token stays valid |
| `bootstrap` | S | `{}` | `{ user, settings, books, users, loans, reservations, activity, wishlist, stats, scope }` |

`identifier` accepts an email address **or** an institutional ID (`M-1004`).
`bootstrap` is role-scoped: `scope: "ALL"` for ADMIN/FACULTY staff views,
`scope: "SELF"` for STUDENT, which returns only that user's loans, reservations,
wishlist and a single-element `users` array.

### Catalogue

| Action | Auth | Payload | Data |
| --- | --- | --- | --- |
| `books.list` | S | `{ includeArchived?, query? }` | `{ books }` |
| `books.get` | S | `{ bookId }` | `{ book }` |
| `books.create` | A/L | `{ title, author, isbn?, publisher?, year?, category?, shelfLocation?, totalCopies, description?, coverImageUrl? }` | `{ book }` |
| `books.update` | A/L | `{ bookId, …same fields }` | `{ book }` |
| `books.archive` | A/L | `{ bookId, archived: boolean }` | `{ book }` |
| `books.delete` | A | `{ bookId }` | `{ deleted: true }` |

`books.delete` removes the row **only** for a title with no circulation history.
If any loan or any open (`PENDING`/`READY`) reservation references it, the call fails
with `CONFLICT` ("This title has circulation history — archive it instead"), because
deleting it would silently rewrite loan and reservation records. Archive is the normal
way to retire a title; delete exists for typo/mistake rows created moments earlier.
The operation is logged in `Activity` before the row is removed.

Availability is **derived**, never stored as truth:
`availableCopies = totalCopies − activeLoans(bookId)`.
`Copies on loan` and `Available copies` are written back to the sheet for readability
only; the backend recomputes them on every read. A book can never go negative.

### Members

| Action | Auth | Payload | Data |
| --- | --- | --- | --- |
| `users.list` | A/L | `{}` | `{ users }` |
| `users.me` | S | `{}` | `{ user }` |
| `users.create` | A/L | `{ name, email, institutionalId?, role, department?, phone?, borrowingLimit?, accountStatus?, password }` | `{ user }` |
| `users.update` | A/L | `{ userId, …fields, password? }` | `{ user }` |
| `users.setStatus` | A/L | `{ userId, accountStatus }` | `{ user }` |
| `users.resetPassword` | A/L | `{ userId, newPassword }` | `{ changed: true }` |
| `users.updateProfile` | S | `{ name?, phone?, department? }` | `{ user }` |

Rules enforced in `MembersService.gs`:

* Only an ADMIN may create or promote to ADMIN; a LIBRARIAN may create STUDENT, FACULTY or
  LIBRARIAN accounts (`FORBIDDEN` otherwise).
* A LIBRARIAN cannot edit, deactivate or reset the password of an ADMIN account.
* A password change revokes every **other** live session for that account and reports
  `sessionsRevoked`; the session that made the change stays valid.
* Duplicate email **and** duplicate institutional ID are rejected (`CONFLICT`).
* An admin cannot deactivate their own account.
* A user with active loans cannot be deactivated.
* No response ever includes `Password hash`, `Password salt` or `Hash iterations` —
  `publicUser_()` projects an explicit allow-list of fields.
* There is no public self-registration action.

### Circulation

| Action | Auth | Payload | Data |
| --- | --- | --- | --- |
| `loans.list` | S | `{ userId?, status? }` | `{ loans }` |
| `loans.issue` | S | `{ bookId, userId? }` | `{ loan, book }` |
| `loans.return` | A | `{ loanId }` | `{ loan, fine, daysLate, book }` |
| `loans.renew` | S | `{ loanId }` | `{ loan }` |

Server-side guarantees (`LoansService.gs`, all inside `withLock_`):

* Availability checked before insert; a book cannot be over-issued or go negative.
* A member cannot hold two copies of the same title.
* Borrowing limit per role (`student_borrow_limit` / `faculty_borrow_limit`) or override.
* A returned loan cannot be returned twice (`CONFLICT`).
* A returned loan cannot be renewed (`CONFLICT`).
* Renewal respects `max_renewals` and is blocked when another member is waiting.
* Self-checkout (STUDENT/FACULTY issuing for themselves) requires
  `allow_self_checkout = true`; staff can always issue for anyone.
* Fine = `overdueDays × fine_per_day`, computed on return and stored on the loan row.

### Reservations

| Action | Auth | Payload | Data |
| --- | --- | --- | --- |
| `reservations.list` | S | `{ userId?, status? }` | `{ reservations }` |
| `reservations.create` | S | `{ bookId, userId? }` | `{ reservation }` |
| `reservations.cancel` | S | `{ reservationId }` | `{ reservation }` |

One open reservation per user per title (`CONFLICT` on duplicates). Users may cancel
only their own hold; admins may cancel any.

### Diagnostics

| Action | Auth | Payload | Data |
| --- | --- | --- | --- |
| `system.diagnostics` | A | `{}` | `{ service, version, spreadsheet, user, role, timezone, tables, sessions, settings, time }` |

A read-only self-report for the Connection panel in Settings. `tables` maps each logical
tab to `{ ok, tab, rows, columns, missing[] }`, so a header that was hand-edited away is
visible without opening the sheet. It never returns tokens, hashes or salts, performs no
writes, and is **ADMIN only** (`FORBIDDEN` for anyone else) because it exposes the
library-wide row counts and effective settings.

### Analytics & activity

| Action | Auth | Payload | Data |
| --- | --- | --- | --- |
| `reports.dashboard` | S | `{}` | `{ stats }` — counts scoped to the caller |
| `reports.analytics` | S | `{ months?, category? }` | `{ buckets, categories, topBooks, overdue, fines, scope }` |
| `activity.list` | S | `{ limit? }` | `{ activity }` |

`scope` is `LIBRARY` for ADMIN/FACULTY and `SELF` for STUDENT — a student's analytics
only ever describe their own borrowing.

### Settings & wishlist

| Action | Auth | Payload | Data |
| --- | --- | --- | --- |
| `settings.get` | S | `{}` | `{ settings, editable }` |
| `settings.update` | A | `{ settings: { …key value map } }` | `{ settings }` |
| `wishlist.list` | S | `{}` | `{ wishlist }` |
| `wishlist.toggle` | S | `{ bookId }` | `{ saved: boolean, wishlist }` |

Unknown action → `UNKNOWN_ACTION`; unknown keys inside `settings.update` → `VALIDATION_ERROR`;
an empty patch → `VALIDATION_ERROR`.

### HTTP probes

`GET /exec?action=health` (the default) and `GET /exec?action=ping` return a small JSON
body and nothing else, so a browser address bar, an uptime monitor or a curl check can
confirm the deployment is live without a session. Any other `action` on `GET` returns
`UNKNOWN_ACTION` with the message "Use POST for data actions."

### Action index (34)

`health`, `auth.login`, `auth.session`, `auth.logout`, `auth.changePassword`,
`bootstrap`, `books.list`, `books.get`, `books.create`, `books.update`, `books.archive`,
`books.delete`, `users.list`, `users.me`, `users.create`, `users.update`,
`users.setStatus`, `users.resetPassword`, `users.updateProfile`, `loans.list`,
`loans.issue`, `loans.return`, `loans.renew`, `reservations.list`,
`reservations.create`, `reservations.cancel`, `wishlist.list`, `wishlist.toggle`,
`settings.get`, `settings.update`, `reports.dashboard`, `reports.analytics`,
`activity.list`, `system.diagnostics`.

---

## 3. Client usage

Everything funnels through one function, so timeouts, envelopes and session expiry are
handled in one place:

```ts
import { callApi } from '@/services/apiClient'

const { books } = await callApi<{ books: ApiBook[] }>('books.list', {})
```

Service modules (`src/services/*Service.ts`) wrap the actions with types:

```ts
import { issueLoan } from '@/services/loansService'
await issueLoan('BK-001', 'U-1003')
```

`callApi` throws `ApiError` (with `code`) on failure. `LibraryProvider` catches it,
returns `{ ok: false, error }` to the caller, sets `dataError` for the header banner,
and never writes an optimistic value that the sheet rejected.

---

## 4. Contract test suite

`qa-tools/api-smoke.mjs` exercises every action against a local mock that implements
the same contract (`qa-tools/mock-backend.mjs`), including the negative cases:

```bash
node qa-tools/api-smoke.mjs                     # 63 checks against the local mock
API=https://script.google.com/macros/s/DEPLOY_ID/exec \
  ADMIN_PASSWORD='…' ALLOW_WRITES=1 node qa-tools/api-smoke.mjs
```

The same file runs against a real deployment and is **read-only by default**: writes
(and account creation, behind a second flag `ALLOW_USER_WRITES=1`) must be opted into,
every created row is tagged `SMOKE-<run>`, and cleanup *archives* the test title rather
than deleting the record — the sheet is never left cleaned up by force.

A second suite, `node qa-tools/gas-backend-test.mjs`, runs the real `.gs` sources inside
a Node VM against a faked `SpreadsheetApp`, so the backend logic itself (locking,
validation, hashing, sheet reuse) is exercised without a Google account. See
`SETUP-GOOGLE-SHEETS.md` §7.
