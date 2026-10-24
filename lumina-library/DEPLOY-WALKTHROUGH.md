> **ARCHIVED LEGACY DOCUMENT — Google Sheets / Apps Script.** The active app now uses Supabase Auth + PostgreSQL. Do not follow these old setup/API instructions for a new connection; use [SUPABASE-SETUP.md](SUPABASE-SETUP.md) instead. The historical Apps Script source and Google Sheet are retained untouched for reference/rollback.

---

# Deploy Lumina's backend — click-by-click

You are connecting **this** spreadsheet:

```
https://docs.google.com/spreadsheets/d/18CGNA07OgL0TAH4mCVKz94AwQGx_Jc1jA2b_e-TfL3s/edit
```

Everything below happens in your Google account. I cannot do any of it for you — Apps
Script has to be created and authorised by the account that owns the sheet. Total time:
**10–15 minutes**, of which most is waiting for Google's authorisation screens.

What this does to your spreadsheet, in one sentence: it **adds** the tabs `Users`,
`Loans`, `Reservations`, `ActivityLogs`, `Settings`, `Sessions`, `Wishlists` and appends
four missing columns to the right of your existing `Books` data. It never clears,
renames, reorders or deletes a row.

---

## Step 1 — Open the script editor (1 min)

1. Open the spreadsheet link above.
2. Menu bar → **Extensions ▸ Apps Script**.
3. A new tab opens with an editor showing a file called `Code.gs` containing
   `function myFunction() { }`.

> **If Extensions ▸ Apps Script is missing:** you are signed into a Google account that
> cannot edit this sheet. Switch accounts (top-right avatar) to the owner, or ask the
> owner to share edit access.

---

## Step 2 — Paste the backend (2 min)

1. In the editor, click into `Code.gs`, press **Ctrl+A** (⌘A on Mac) and **Delete** — the
   `myFunction` line must disappear.
2. Open `google-sheets/LUMINA-APPS-SCRIPT.gs` from this workspace (it is 100 KB — the
   editor takes a few seconds to swallow it).
3. **Select all of it, copy, and paste it into the empty `Code.gs`.**
4. **Ctrl+S** to save. The file name in the tab loses its dot when saved.

**You should see:** the editor shows a header comment starting
`LUMINA LIBRARY — Google Apps Script backend (single-file bundle)`. The status bar says
*Saved*.

> Paste the **whole** file, including the comment block at the top. It is one generated
> file that already contains all 13 backend files in the right order — do not create
> extra files. (If you would rather keep one file per feature for easier editing later,
> use `google-sheets/backend/*.gs` + the `clasp` route in
> `SETUP-GOOGLE-SHEETS.md §1` instead. Do not do both.)

---

## Step 3 — Paste the manifest (1 min)

1. Left sidebar → **⚙ Project Settings**.
2. Tick **“Show `appsscript.json` manifest file in editor”**.
3. Back in the file list (left sidebar, **`< >` Editor** icon), open the new
   `appsscript.json`.
4. Replace **all** of its content with the content of
   `google-sheets/backend/appsscript.json` (11 lines — you can retype them):

```json
{
  "timeZone": "Asia/Kolkata",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

5. **Ctrl+S**.

**Why it matters:** `runtimeVersion: V8` is required (the code uses modern JavaScript),
`executeAs: USER_DEPLOYING` makes the Web App run as you so it can touch this sheet, and
`ANYONE_ANONYMOUS` lets the browser call it without a Google sign-in.

---

## Step 4 — Two script properties (1 min)

Still on **⚙ Project Settings**, scroll to **Script properties** → **Add script property**.

| Property | Value |
| --- | --- |
| `SEED_ADMIN_EMAIL` | the email you want as the library administrator, e.g. `you@gmail.com` |

Optional, only if you want them:

| Property | Value |
| --- | --- |
| `SPREADSHEET_ID` | leave unset — the id is compiled into `Config.gs` and it is the correct sheet |
| `EMAIL_DOMAIN` | e.g. `college.edu` to reject accounts outside that domain |
| `API_BASE_URL` | your `/exec` URL, only used by the built-in self-test |

Click **Save script properties**.

> Do **not** set `SEED_ADMIN_PASSWORD`. Step 5 generates one for you.

---

## Step 5 — Create the tabs (`setupLumina`) (2 min)

1. In the toolbar above the code, the function dropdown currently shows `doGet`.
   Change it to **`setupLumina`**.
2. Click **▶ Run**.
3. The first run asks for authorisation:
   * **Review permissions** → choose your Google account.
   * A warning appears: *“Google hasn't verified this app”* → **Advanced** →
     **Go to Lumina Library (unsafe)**. This is expected: it is *your own* script,
     published by nobody, so there is nothing to verify.
   * **Allow**.
4. Wait ~5 seconds. A **Execution log** panel appears at the bottom (if it does not:
   **View ▸ Logs** or **Ctrl+Enter**).

**You should see a log like this** — the wording below is the exact output, produced by
running this code against a copy of your sheet's shape (your tab name may be `Sheet1`):

```
Spreadsheet: "Your sheet name" (18CGNA07OgL0TAH4mCVKz94AwQGx_Jc1jA2b_e-TfL3s)
Existing tabs: Sheet1
MODE: apply changes (append-only).
  append  BOOKS → tab "Sheet1" gains columns: Description, Cover image URL, Created at, Updated at — existing columns and rows untouched
  create  USERS → tab "Users"
  create  LOANS → tab "Loans"
  create  RESERVATIONS → tab "Reservations"
  create  ACTIVITY → tab "ActivityLogs"
  create  SETTINGS → tab "Settings"
  create  SESSIONS → tab "Sessions"
  create  WISHLISTS → tab "Wishlists"
  settings: seeded library_name, loan_duration_days, max_renewals, renewal_extension_days, fine_per_day, student_borrow_limit, faculty_borrow_limit, reservation_hold_days, allow_self_checkout, block_issue_on_unpaid_fines, fine_block_threshold
  admin: seeded you@example.com (password stored in Script property SEED_ADMIN_PASSWORD).
         Sign in once and change it from Profile → Change password.

Next: run verifyLuminaSetup(), then Deploy → New deployment → Web app
      (Execute as: Me, Who has access: Anyone) and copy the /exec URL.
```

The `append BOOKS …` line is the only line that touches existing data, and it only adds
columns on the right.

5. **Now copy the generated password:** **⚙ Project Settings ▸ Script properties** →
   find `SEED_ADMIN_PASSWORD` → copy the value (it looks like `Lumina@4821`).
   That is the only copy. Put it in a password manager; you will change it on first
   sign-in.

6. Switch back to the spreadsheet tab and press **F5**. The new tabs are at the bottom,
   and your `Books` tab still has your `BK101` row in row 2, with the four new columns
   added to the right.

> Running `setupLumina` a second time is safe — it reports “nothing to do” and changes
> nothing. Your existing rows are never rewritten.

---

## Step 6 — Verify (`verifyLuminaSetup`) (1 min)

1. Function dropdown → **`verifyLuminaSetup`** → **▶ Run**.
2. Read the log.

**You should see:**

```
Lumina API v2.1.0 — setup verification

  PASS  Spreadsheet is readable — "Your sheet name" · 18CGNA07...
  PASS  Spreadsheet is writable — ...
  PASS  Tab for BOOKS — "Sheet1" · 1 rows
  PASS  Tab for USERS — "Users" · 1 rows
  ... one PASS per tab ...
  PASS  An ACTIVE administrator exists
  PASS  Policy settings present — 11 keys
  PASS  Time zone — Asia/Kolkata
  WARN  Catalogue rows need attention — 1 row(s) have a blank title, author or copy count: BK101. ...
  PASS  Running as — you@gmail.com

Everything looks good. Deploy the Web app next.
```

* **Every line `PASS`** → continue.
* **A `WARN` about `BK101`** → normal. That is your existing placeholder row with an empty
  title/author; the app keeps it and shows it with one placeholder copy. Fill it in or
  delete it in the sheet whenever you like.
* **Any `FAIL`** → the line says what is wrong (usually “run setupLumina()” or a column
  name that was hand-edited). Fix, re-run.

---

## Step 7 — Deploy the Web App (2 min)

1. Top-right **Deploy ▸ New deployment**.
2. Click the **⚙ gear** next to *Select type* → **Web app**.
3. Fill in exactly:

| Field | Value |
| --- | --- |
| Description | `Lumina API v2.1.0` |
| Execute as | **Me (your@email)** |
| Who has access | **Anyone** |

4. **Deploy** → authorise again if asked (same *Advanced → Go to … (unsafe) → Allow* path).
5. Copy the **Web app URL**. It must end in **`/exec`**:

```
https://script.google.com/macros/s/AKfycb....../exec
```

6. **Test it right now**: paste that URL into a new browser tab and add
   `?action=health`:

```
https://script.google.com/macros/s/AKfycb....../exec?action=health
```

**You should see JSON in the browser**, something like:

```json
{"ok":true,"data":{"service":"lumina-library-api","version":"2.1.0","tabs":["Sheet1","Users",...],"counts":{"books":1,"users":1,...},"time":"2026-10-23T…"}}
```

* **A Google sign-in page or “You need permission”** → *Who has access* was not **Anyone**.
  Deploy ▸ **Manage deployments** ▸ ✏️ edit ▸ set **Anyone** ▸ **Deploy** (this creates a
  new version at the same URL).
* **“Script function not found: doGet”** → the paste in Step 2 did not save. Re-paste,
  **Ctrl+S**, then **Manage deployments ▸ edit ▸ Version: New version ▸ Deploy**.

---

## Step 8 — Prove it against the real API (2 min)

From this workspace, with the URL from Step 7. **Start with the read-only run** — it makes
no writes at all:

```bash
cd /home/user
API='https://script.google.com/macros/s/AKfycb....../exec' \
  ADMIN_PASSWORD='Lumina@4821' \
  node qa-tools/api-smoke.mjs
```

Then allow the write checks (it creates one book named `SMOKE-<random>`, then archives it):

```bash
API='https://script.google.com/macros/s/AKfycb....../exec' \
  ADMIN_PASSWORD='Lumina@4821' ALLOW_WRITES=1 \
  node qa-tools/api-smoke.mjs
```

**You should see `63/63 checks passed`.** Anything else prints the failing check with the
error code — paste that output here and I will fix it.

> You do not have to give me the `/exec` URL or the password to do this — you can run the
> two commands yourself. If you would rather I run them, paste both and change the admin
> password afterwards (Profile ▸ Change password).

---

## Step 9 — Point the app at it (1 min)

Only after Step 8 is green:

```bash
cd /home/user/lumina-library
echo 'VITE_API_BASE_URL=https://script.google.com/macros/s/AKfycb....../exec' > .env.local
```

…then restart the dev server (`Ctrl+C`, `npm run dev`). Open
`http://localhost:5173/login`: the demo role cards are replaced by an **email/ID +
password** form. Sign in with the `SEED_ADMIN_EMAIL` address and the password from Step 5.

Now:

* **Books ▸ Add book** → watch the row appear in your `Books` tab within a second.
* **Circulation ▸ Issue** → `Loans` gains a row and `Copies on loan` increments.
* **Settings ▸ Connection** → *Connected*, with the health latency.
* Delete `.env.local` and restart at any time to go back to Demo mode.

---

## Updating an existing deployment (done — kept for reference)

Your project is running **v2.1.0**. The repository is now **v2.1.1**, which fixes two bugs
these live runs found. Replacing the code takes a minute:

1. In the Apps Script editor, select everything in `Code.gs` (**Ctrl+A**) and delete it.
2. Open `google-sheets/LUMINA-APPS-SCRIPT.gs` in this workspace and paste the whole file.
3. **Ctrl+S**.
4. **Deploy ▸ Manage deployments ▸ ✏️ (pencil) ▸ Version: `New version` ▸ Deploy.**
   The `/exec` URL stays the same, so nothing in the app needs changing.
5. Confirm the version: open `<your /exec url>?action=health` and check
   `"version":"2.1.1"`.

What changed in 2.1.1:

* issued loans, renewals, returns and holds now come back with the book title and member
  name filled in (they were blank — the Reservations and Loans screens showed nameless rows
  right after a write);
* sign-in dropped from ~25 s to ~4 s (the hash work factor is 2 000 rounds instead of
  12 000, because Apps Script bills each round as a remote call);
* existing stored passwords are re-hashed at the new work factor on the next successful
  sign-in, so your current password keeps working.

---

## If something goes wrong

| What you see | What it means | Fix |
| --- | --- | --- |
| `Invalid or missing action` | something sent `application/json` | the app sends `text/plain`; if you are testing with curl, add `-H 'Content-Type: text/plain;charset=utf-8'` |
| App shows *Could not reach the library server* | wrong URL, or the deployment is not **Anyone** | re-check Step 7; open `?action=health` in a browser |
| `CONFIG_ERROR` | tabs/settings missing | run `setupLumina()`, then `verifyLuminaSetup()` |
| Login says *Email/ID or password is incorrect* | wrong password, or you are hitting a different spreadsheet | re-read `SEED_ADMIN_PASSWORD`; `SPREADSHEET_ID` must be unset or the id above |
| Login says *Too many attempts* | 8 failed sign-ins in 15 minutes | wait 15 minutes, or fix the password |
| Student pressing **Borrow** gets *Forbidden* | `allow_self_checkout` is `false` by default | an admin sets it in the `Settings` tab, or issues the book at the desk |
| Frozen for 2–4 s on the first call | Apps Script cold start | expected |
| Changed the code | the URL still serves the old version | **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy** |

---

## What I need back from you

1. The **`/exec` URL** (or just the result of running the two commands in Step 8).
2. Confirmation that Step 6 printed `Everything looks good`.
3. Your **`SEED_ADMIN_EMAIL`**, so I can note which account is the administrator.

Until Step 8 passes, the app stays in Demo mode and nothing in the docs claims your sheet
is connected.
