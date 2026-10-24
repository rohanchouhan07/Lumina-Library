# Connect Lumina Library to your Google Sheet

This is the deployment guide for the Apps Script backend in `google-sheets/backend/`.
You need: the spreadsheet, a Google account that owns it, and ~15 minutes.

**Nothing here is done for you yet.** The backend logic is written and executed (86 checks
in a Node VM with a faked spreadsheet), and the transport is proven against a contract
mock — but this repo has **never been run against your live sheet**. The first real read
and write happen when you complete these steps. Until then the app says *Demo mode*
rather than pretending to be connected.

> Prefer to be walked through it screen by screen, with what each step should look like? Use
> **[DEPLOY-WALKTHROUGH.md](DEPLOY-WALKTHROUGH.md)** — same steps, more detail. This file is
> the reference; that one is the guided run.

## The six steps, in order

| # | Where | Do this | Success looks like |
| --- | --- | --- | --- |
| 1 | Sheet ▸ Extensions ▸ Apps Script | Paste `google-sheets/LUMINA-APPS-SCRIPT.gs` into `Code.gs`; paste `google-sheets/backend/appsscript.json` into the manifest | 13 backend files' worth of code in one file, no red squiggles |
| 2 | Project Settings ▸ Script properties | `SEED_ADMIN_EMAIL` = your admin address (optional `SPREADSHEET_ID`, `EMAIL_DOMAIN`) | Two properties listed |
| 3 | Script editor | Run `setupLumina()` | Log lists the tabs it created; `SEED_ADMIN_PASSWORD` now holds a generated password |
| 4 | Script editor | Run `verifyLuminaSetup()` | Every line `PASS` (a `WARN` about `BK101` is fine), ending *"Everything looks good"* |
| 5 | Deploy ▸ New deployment ▸ Web app | Execute as **Me**, access **Anyone**; copy the `/exec` URL | `?action=health` in a browser returns JSON with `"ok":true` |
| 6 | This repo | `API=<exec url> ADMIN_PASSWORD=<generated> node qa-tools/api-smoke.mjs` → then set `VITE_API_BASE_URL=<exec url>` and restart `npm run dev` | `63/63 checks passed`, then the login screen asks for email + password |

Steps 3–5 are the only ones that change your spreadsheet, and step 3 only **adds** tabs and
headers. Nothing existing is renamed, reordered, cleared or deleted.

---

## 0. Before you start — what will touch your sheet

* Existing tabs are **not** renamed, reordered or cleared.
* Existing columns in the books tab are kept in place; the backend only **appends**
  missing columns to the right (`Description`, `Cover image URL`, `Created at`,
  `Updated at`).
* It **creates** these tabs if they do not exist, with headers in row 1:
  `Books`, `Users`, `Loans`, `Reservations`, `ActivityLogs`, `Settings`, `Sessions`,
  `Wishlists`.
* One placeholder catalogue row (`BK101`) exists in the books tab today; it is treated
  as a normal book. Delete it in the sheet if you do not want it in the catalogue.

---

## 1. Create the Apps Script project

1. Open the spreadsheet →
   **Extensions ▸ Apps Script**.
2. Delete the default `Code.gs` contents.
3. Create one file per file in `google-sheets/backend/` and paste the contents.
   Names must match exactly (Apps Script appends `.gs`):

   ```
   appsscript.json      Config.gs        Validation.gs    SheetDb.gs
   AuthService.gs       BooksService.gs  MembersService.gs
   SettingsService.gs   LoansService.gs  ReservationsService.gs
   ReportsService.gs    WishlistService.gs  Code.gs       Setup.gs
   ```

   For `appsscript.json`: **Project Settings ▸ “Show `appsscript.json` manifest file”**,
   then paste it into the manifest editor (do not create it as a `.gs` file).

4. **Project Settings ▸ Script properties** — add:

   | Key | Value |
   | --- | --- |
   | `SPREADSHEET_ID` | `18CGNA07OgL0TAH4mCVKz94AwQGx_Jc1jA2b_e-TfL3s` (or your own) |
   | `SEED_ADMIN_EMAIL` | the address you want the first administrator to use |
   | `EMAIL_DOMAIN` | *(optional)* e.g. `college.edu` to reject outside addresses |

   Leave `SEED_ADMIN_PASSWORD` unset — `setupLumina()` generates one and stores it in the
   same place so you can read it back.

---

## 2. Initialise the sheet

1. In the editor, select the function **`setupLumina`** → **Run**.
2. Authorise it when Google asks (it needs access to the spreadsheet you own).
3. Open **View ▸ Logs** (or the execution log). You should see lines like:

   ```
   Spreadsheet: <name> (<id>)
   Existing tabs: Sheet1, Books, …
   Reused tab "Books" for BOOKS (headers extended, data untouched)
   Created tab "Users" for USERS
   …
   Settings seeded: library_name, loan_duration_days, …
   Seeded administrator admin@your-domain with a generated password (see Script property SEED_ADMIN_PASSWORD)
   ```

4. Run **`verifyLuminaSetup()`** — it prints a per-tab row count and reports any header
   mismatch. Everything should read `ok`.
5. Copy the generated admin password from **Script properties →
   `SEED_ADMIN_PASSWORD`**.

If a tab name already exists with a **different header signature** (for example your
books tab has `Shelf` renamed to `Location`), `verifyLuminaSetup()` names the mismatch.
Either rename the header back or add the canonical one — the backend matches tabs by
their headers, not by position, and will not guess.

---

## 3. Deploy the Web App

1. **Deploy ▸ New deployment ▸ Web app**.
2. Description: `Lumina API v2`.
3. **Execute as: Me** (the script needs your sheet access).
4. **Who has access: Anyone** — required, because the browser calls it with `fetch`
   without a Google login. Every action except `health` and `auth.login` still requires
   a valid session token.
5. **Deploy**, then copy the **Web app URL** (ends in `/exec`).
6. Quick check in a terminal:

   ```bash
   curl -L -X POST 'https://script.google.com/macros/s/XXXX/exec' \
     -H 'Content-Type: text/plain;charset=utf-8' \
     -d '{"action":"health"}'
   # → {"ok":true,"data":{"service":"lumina-library-api","version":"2.0.0",…}}
   ```

   `-L` matters: Apps Script answers with a `302`.

---

## 4. Point the frontend at it

```bash
cd lumina-library
cp .env.example .env.local
```

```ini
VITE_API_BASE_URL=https://script.google.com/macros/s/XXXX/exec
VITE_API_TIMEOUT_MS=20000
VITE_SHOW_DEMO_HINTS=false
```

Restart dev (`npm run dev`) — Vite inlines `VITE_*` at start-up.

With this set the app is in **live mode**: `/login` becomes an email/ID + password form,
the demo role picker disappears, and every screen reads from the sheet.

> **Local development shortcut.** `.env.local` in this repo currently ships
> `VITE_API_BASE_URL=/api`, and `vite.config.ts` proxies `/api` to
> `http://127.0.0.1:8100` where `qa-tools/mock-backend.mjs` runs the same contract.
> That is what makes the preview work inside the sandbox. Replace it with your real
> `/exec` URL (absolute) for a genuine deployment — the proxy is dev-only glue and is
> never used in a production build.

---

## 5. Verify the deployment

0. First, in the Apps Script editor, run **`verifyLuminaSetup`**. It prints one line per
   check, each starting `PASS` or `FAIL`, and ends with either
   *“Everything looks good. Deploy the Web app next.”* or *“N check(s) failed”*. It checks
   the spreadsheet, every required tab, every required header, that the function can write
   and revert a scratch cell, that an active administrator exists, and the time zone.
   A line starting `WARN` is about **your** existing data, not the setup — for example
   `BK101` has a blank title and copy count, so it is kept and shown with one placeholder
   copy until you complete or delete it.

```bash
cd /home/user

# 1. reads only — safe against the live sheet, no writes at all
API=https://script.google.com/macros/s/XXXX/exec \
  ADMIN_PASSWORD='the-password-from-script-properties' \
  node qa-tools/api-smoke.mjs

# 2. allow the write checks (creates a SMOKE-<run> title, then archives it)
API=https://script.google.com/macros/s/XXXX/exec \
  ADMIN_PASSWORD='…' ALLOW_WRITES=1 node qa-tools/api-smoke.mjs

# 3. also exercise account creation / deactivation (leaves an inactive smoke user)
API=… ADMIN_PASSWORD='…' ALLOW_WRITES=1 ALLOW_USER_WRITES=1 node qa-tools/api-smoke.mjs
```

Expect `63/63 checks passed`. The suite signs in as all three roles, proves students cannot
create books, list users, delete titles or edit settings, proves a double return and a
duplicate reservation are rejected, proves availability never goes negative, and proves no
hash, salt or token appears in any response. It is read-only unless you pass the flags
above, and its cleanup **archives** the test title instead of deleting it, because a
title that has been borrowed must keep its history.

Then in the browser:

1. Sign in with the seeded admin → dashboard shows your sheet's counts.
2. **Books ▸ Add book** → the row appears in the `Books` tab within a second or two.
3. **Circulation ▸ Issue** → `Loans` gains a row and `Copies on loan` increments.
4. **Settings ▸ Connection & sync** → *Connected*, health latency, last-read time.
5. Edit a title directly in the sheet, press **Refresh now** → the change appears.
   (There is no push: refreshes happen on sign-in, after each change, and every two
   minutes.)

---

## 6. Accounts

Only an ADMIN can create accounts. From **Members ▸ Register member** (live mode asks
for an initial password) or directly:

```bash
curl -L -X POST "$API" -H 'Content-Type: text/plain;charset=utf-8' -d '{
  "action":"users.create",
  "token":"<admin token>",
  "payload":{"name":"Riya Sharma","email":"riya@college.edu","role":"STUDENT",
             "department":"Computer Science","password":"Riya@2026","accountStatus":"ACTIVE"}
}'
```

Sign-in accepts the email **or** the institutional ID. There is no public sign-up.

---

## 7. Things that will bite

| Symptom | Cause | Fix |
| --- | --- | --- |
| Browser shows `NETWORK_ERROR` / "Could not reach the library server" | deployment access is not *Anyone*, or you edited the script without redeploying | Deploy ▸ Manage deployments ▸ edit ▸ **new version** |
| `Invalid or missing action` | `Content-Type: application/json` was sent (sends a preflight Apps Script cannot answer) | send `text/plain` |
| `CONFIG_ERROR` on first call | `setupLumina()` never ran, so `Settings`/`Users` are missing | run it, then `verifyLuminaSetup()` |
| `FORBIDDEN` when issuing a book as a student | `allow_self_checkout` is `false` | set `allow_self_checkout=true` in the `Settings` tab or issue as staff |
| A tab is ignored | its headers do not match | `verifyLuminaSetup()` names the mismatch |
| Sign-in works but every screen is empty | the sheet has no rows yet | add books via the app, or import rows matching the headers in `docs/SCHEMA-MAPPING.md` |
| Slow first call (~2–4 s) | Apps Script cold start | expected; later calls are faster |

---

## 8. Verify the backend logic without touching Google

Two checks run entirely in Node, so a mistake is caught before it reaches your sheet.

**`node qa-tools/gas-backend-test.mjs`** loads the real `.gs` files into a Node VM with a
faked `SpreadsheetApp` / `PropertiesService` / `LockService` / `Utilities` / `ContentService`
(`qa-tools/gas-harness.mjs`), seeds a workbook shaped like your live sheet (the 13 legacy
book columns plus a `BK101` row), then drives `doPost`/`doGet` exactly as the browser does.
86 checks cover: dry-run setup creating nothing, idempotent setup, legacy columns kept in
order with new ones appended, login + salted hashing, role matrix, stock never negative,
double-return and duplicate-hold rejection, deactivation killing live sessions, formula
injection neutralised, activity logging, `books.delete` guardrails, and a final audit that
`BK101`'s identity columns were never rewritten.

The harness is a *simulation*: it proves the logic, not Google's runtime. OAuth, quotas and
real `/exec` routing are only proven by step 5.

**`node google-sheets/build-bundle.mjs`** regenerates `LUMINA-APPS-SCRIPT.gs`. It
concatenates the files in the fixed order `Config → Validation → SheetDb → AuthService →
BooksService → MembersService → SettingsService → LoansService → ReservationsService →
ReportsService → WishlistService → Setup → Code`, because Apps Script hoists top-level
functions but the router table in `Code.gs` must be built after its handlers exist. Edit
the `.gs` files, never the bundle.

Apps Script has no `node_modules`, so the `.gs` files use only V8 + Apps Script globals;
`node --check` passes on the bundle (copy it to `.js` first — Node rejects the `.gs`
extension).

---

## 9. Undo

There is no destructive step to undo. To disconnect, clear `VITE_API_BASE_URL` — the app
returns to the offline demo. The tabs `setupLumina()` created can be deleted by hand; the
original catalogue columns are untouched.
