# Accounts: rotate the admin password, and add a librarian or a student

Everything below is for **your** deployment (`admin@gmail.com`, API v2.2.0). Three ways to
do each job — pick the one that suits you.

| Task | Easiest route | Also possible |
| --- | --- | --- |
| Rotate the admin password | **Profile ▸ Password card** in the app | `resetAdminPassword()` in the Apps Script editor |
| Create a **librarian** | **Members ▸ Register member → Role: Librarian** | `users.create` via curl, or a row pasted into the `Users` tab |
| Create a **student** | **Members ▸ Register member → Role: Student** | same |

> **New in 2.2.1:** the public site can read the catalogue without a session
> (`catalogue.public`), so the landing page and `/catalog` no longer show zeroes to signed-out
> visitors.
>
> **New in 2.2.0:** the backend now has a real `LIBRARIAN` role. Before this, the live
> backend only knew `ADMIN`, `FACULTY` and `STUDENT` — a librarian was silently stored as
> faculty and could not issue or return books for anyone. Update your deployment (§0) before
> you try to create one.

---

## 0. Update the deployment to 2.2.1 (once, 2 minutes)

1. Apps Script editor → select everything in `Code.gs` → **Delete**.
2. Paste the whole of `lumina-library/google-sheets/LUMINA-APPS-SCRIPT.gs`.
3. **Ctrl+S**.
4. **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: `New version` ▸ Deploy.**
5. Check: open `<your /exec url>?action=health` — it must say `"version":"2.2.1"`.

**The `/exec` URL does not change** when you deploy a new version of the same deployment —
that is expected, and it is why the frontend's `VITE_API_BASE_URL` stays valid. (You would
only get a new URL from **Deploy ▸ New deployment**, which you do not need.)

Nothing in your spreadsheet changes: no new tabs, no new columns, no rows touched.

> **Patience on a fresh tab.** The first request after a new deployment (or after the app has
> been idle) pays a Google cold start. On `/app/profile` you may see *"Verifying your
> session…"* for up to ~10 s before the page paints. That is the live `auth.session` call,
> not a hang — the card is there, it just arrives a moment later.

---

## 1. Rotate the admin password

### Route A — in the app (recommended)

1. Sign in at `http://localhost:5173/login` as `admin@gmail.com`.
2. Bottom-left avatar → **Profile** (or go to `/app/profile`).
3. Scroll to the **Password** card (under the preferences block). It carries a small
   **Live account** badge when the app is talking to the real backend.
4. Enter the current password (the one you set last time — the seed value was replaced
   during setup and no longer works), then the new one twice.
   Rules: at least 8 characters, with at least one letter and one number.
5. Submit — the toast confirms the change and tells you how many other sessions were signed
   out. The card also keeps a green "Password updated" line until you navigate away.

What happens server-side:

* the new password is hashed with a fresh random salt at the current work factor
  (2 000 rounds) and written to the `Users` tab — the old hash and salt are overwritten,
  never kept;
* **every other signed-in session for that account is revoked.** If you were signed in on
  another browser or a script still holds a token, that token stops working immediately.
  The session you changed it from stays valid;
* an `ActivityLogs` row `user.password` records it (with the number of sessions signed out).

You can now delete `SEED_ADMIN_PASSWORD` from Script properties if you like — it is only used
to seed the first account and to power `resetAdminPassword()`.

### Route B — recovery, when you are locked out

If you have forgotten the password, the app cannot help you. Use the editor:

1. Apps Script editor → function dropdown → **`resetAdminPassword`** → **▶ Run**.
2. **Project Settings ▸ Script properties** → copy the new `SEED_ADMIN_PASSWORD`
   (looks like `Lumina@4821`).
3. Sign in with it, then immediately repeat Route A to set a password you choose.

`resetAdminPassword()` only touches the `U-0001` administrator row: new salt, new hash, no
other change. It does **not** print the password into the execution log (logs can be shared);
it stores it in Script properties instead.

### What NOT to do

* Do not edit `Password hash` / `Password salt` by hand in the sheet — the hash is
  `HMAC-SHA256` iterated 2 000 times over `salt:password`, so you cannot type a valid one.
* Do not put the password in `.env.local`, in the repo, or in a chat message (this one has
  been in one — rotate it today).

---

## 2. Create a librarian

A librarian runs the desk: add/edit/archive books, register and edit members, issue, return
and renew for anyone, manage holds, read reports and the activity log. They **cannot** change
circulation policy, read diagnostics, delete titles, or touch an administrator account.

### Route A — in the app (recommended)

1. Sign in as the administrator.
2. Sidebar → **Members**.
3. **Register member** (top-right).
4. Fill in:

   | Field | Example | Notes |
   | --- | --- | --- |
   | Full name | `Nisha Verma` | 2–120 characters |
   | Email | `nisha@yourcollege.edu` | must be unique; this is also the sign-in name |
   | Institutional ID | `LIB-002` | must be unique; sign-in works with this too |
   | Role | **Librarian (desk staff)** | ← the new option |
   | Department | `Library` | optional |
   | Phone | *(blank)* | optional |
   | Borrowing limit | *(blank)* | blank = the role default (staff limit) |
   | Membership status | `Active` | |
   | Initial password | `Desk@2026` | ≥ 8 chars, letter + number; give it to them, they change it themselves |

5. **Register member**. The row appears in the `Users` tab immediately and the person can
   sign in at `/login` with either the email or `LIB-002`.

### Route B — curl, same thing

```bash
API='https://script.google.com/macros/s/<YOUR-DEPLOYMENT-ID>/exec'

# 1. get an admin token
TOKEN=$(curl -sL -X POST "$API" -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"action":"auth.login","payload":{"identifier":"admin@gmail.com","password":"YOUR-ADMIN-PASSWORD"}}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])')

# 2. create the librarian
curl -sL -X POST "$API" -H 'Content-Type: text/plain;charset=utf-8' -d "{
  \"action\":\"users.create\",
  \"token\":\"$TOKEN\",
  \"payload\":{
    \"name\":\"Nisha Verma\",
    \"email\":\"nisha@yourcollege.edu\",
    \"institutionalId\":\"LIB-002\",
    \"role\":\"LIBRARIAN\",
    \"department\":\"Library\",
    \"password\":\"Desk@2026\",
    \"accountStatus\":\"ACTIVE\"
  }
}"
```

Expect `{"ok":true,"data":{"user":{…,"role":"LIBRARIAN"…}}}`. Typical refusals:
`CONFLICT` (email or ID already used), `VALIDATION_ERROR` (weak password, missing name),
`FORBIDDEN` (you tried to create an `ADMIN` as a librarian).

### Route C — one row in the `Users` tab

Possible, but you must fill every column, including a **valid** `Password hash` and
`Password salt` — which you cannot compute in a spreadsheet. Use Route A or B and let the
backend hash it.

---

## 3. Create a student

Identical to §2 with `Role: Student` / `"role":"STUDENT"`, and normally
`institutionalId` = the enrolment number (`M-2026-114`). Default borrow limit comes from
`student_borrow_limit` in the `Settings` tab (3 out of the box, editable under
**Settings ▸ Circulation policy** as an administrator).

```json
{"action":"users.create","token":"…","payload":{
  "name":"Rahul Yadav","email":"rahul@yourcollege.edu",
  "institutionalId":"M-2026-114","role":"STUDENT",
  "department":"Computer Science","password":"Rahul@2026","accountStatus":"ACTIVE"}}
```

---

## 4. Who can create whom

| Actor | Can create | Cannot |
| --- | --- | --- |
| ADMIN | any role | deactivate themselves |
| LIBRARIAN | STUDENT, FACULTY, LIBRARIAN | create/promote ADMIN, edit/deactivate/reset an ADMIN |
| FACULTY / STUDENT | nothing | — |

Enforced in `MembersService.gs` (`assertCanManageTarget_`, `validateUserPayload_`) — the UI
hides the controls, and the server refuses anyway with `FORBIDDEN`.

---

## 5. First-day checklist for a new account

1. Sign in at `/login` with the email or institutional ID.
2. **Profile ▸ Change password** immediately (this also revokes any other session).
3. Confirm what they can see: a librarian lands on a library-wide dashboard; a student sees
   only their own loans and holds.
4. To suspend someone: **Members → open the member → Deactivate**. Their live sessions are
   revoked on the spot; reactivating restores access.

---

## 6. Verify it worked

```bash
# from /home/user
API='…/exec' node qa-tools/live-public-check.mjs                 # 21 checks, no password
API='…/exec' ADMIN_PASSWORD='…' node qa-tools/api-smoke.mjs      # includes the librarian checks

# Drive the real screens instead of the API (19 checks, disposable accounts):
#   admin creates a librarian + a student in the Members form, signs in as each,
#   checks the guard rails, then rotates a password and proves the old one is dead.
BASE_URL=http://localhost:5174 node qa-tools/roles-ui-check.mjs
```

Or in the app: **Members** lists every account with its role badge; sign in as the new
librarian and confirm the sidebar shows Members, Circulation and Reports but **not**
Settings ▸ policy editing.

### The desk account created during setup

| Field | Value |
| --- | --- |
| Name | Nisha Verma (Desk QA) |
| Email | `librarian.qa@lumina.test` |
| Institutional ID | `LIB-QA` |
| Initial password | `Desk@2026` — change it on first real use via **Profile ▸ Password** |
| Role | `LIBRARIAN` (live sheet, `U-0007`) |

It is a genuine account in your `Users` tab, so treat it like staff: rotate the password or
deactivate it in **Members ▸ (row) ▸ ⋯ ▸ Deactivate** when you have your own staff in place.
Deactivating does not delete the row, and history stays intact.

> `roles-ui-check` defaults to the local contract mock on **:5174**, where it can create
> throwaway accounts safely. Point it at **:5173** only if you accept new rows in the real
> sheet (`BASE_URL=http://localhost:5173 ADMIN_ID=admin@gmail.com ADMIN_PASSWORD='…'`), and
> deactivate the two test accounts afterwards in **Members**.
