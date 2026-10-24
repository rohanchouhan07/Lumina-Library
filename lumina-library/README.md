# Lumina Library

**Discover Knowledge. Manage Smarter.**

A responsive college-library prototype with a public catalogue and role-based workspace for administrators, librarians, faculty and students.

## Current backend status

The frontend has been switched from Google Sheets/Apps Script to **Supabase Auth + PostgreSQL**. The Supabase integration code, migrations and an account-management Edge Function are prepared, but it is **not connected to your Supabase project yet**: no project URL or publishable key has been supplied, and the SQL has not been run on a live project. Until those steps are completed, the app runs in its honest local demo mode.

Start with **[SUPABASE-SETUP.md](SUPABASE-SETUP.md)**. It is written for Supabase Dashboard / Vercel browser clicks—no terminal required for the project owner.

### Data and security design

- Supabase Auth owns passwords, sign-in and refreshable sessions. Auth tokens are kept in `sessionStorage` for the open tab only—never `localStorage`.
- `profiles.role` is read by PostgreSQL on every RPC call; the browser never supplies a trusted role.
- The browser receives only a **publishable** Supabase key. Direct table grants are revoked for `anon` and `authenticated`; tables have RLS enabled with no direct-access policies. Reads and writes go through `public.lumina_api()` and its server-side role checks.
- Public signed-out pages receive active book/title fields plus aggregate counters only—never member names, emails, loans, reservations or fines.
- Fines remain simulated and are not charges.
- The one-shot `supabase/setup.sql` seeds the 15 title-level catalogue records only. It does not import private users, loans, reservations or password hashes. It never changes the source Google Sheet.

## Run locally

```bash
npm install
npm run dev
```

With no Supabase variables the app opens in demo mode, using fictional sample data stored in the browser. `npm run dev:demo` forces this mode even after a local Supabase configuration exists.

For a developer's local Supabase connection, set these values in the ignored `.env.local` file after following the setup guide:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The publishable key is designed for browser use; never place the database password, Supabase secret key or legacy `service_role` key in a `VITE_*` variable.

## App areas

- Public routes: `/`, `/catalog`, `/books/:id`, `/login`
- Authenticated routes: `/app/*`
- Roles: `ADMIN`, `LIBRARIAN`, `FACULTY`, `STUDENT`
- Library records, permissions, circulation and analytics share one PostgreSQL database.
- Catalogue availability is derived from total copies minus active loans; it is not copied from old sheet totals.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

The Supabase SQL has also been parsed and exercised against a local PostgreSQL-compatible test engine for schema creation, seeded public catalogue, admin bootstrap, book issue, settings update, analytics and reservation create/cancel. That is a local validation only—not a claim that a live Supabase project or Vercel deployment is connected.

## Disabled Google Sheets integration

The active React app no longer imports or calls the Apps Script transport. The old frontend transport and mapping/sync helpers are retained as line-commented `.txt` reference files under `src/services/legacy/`; the `google-sheets/` backend source and the existing spreadsheet are left untouched for rollback/reference. Historical Sheets setup/API documents are **legacy** and should not be used to configure this build.
