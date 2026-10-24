# Connect Lumina Library to Supabase

This is a browser-only setup guide. Do not send me your database password, a Supabase secret/service-role key, or any member password.

## What is already prepared

- [`supabase/setup.sql`](supabase/setup.sql) is a one-shot schema + RPC + public-catalogue seed. It creates the library tables, role checks, derived availability, simulated fines, public title-only catalogue, and non-destructive seed records for the 15 public books.
- [`supabase/functions/manage-user/index.ts`](supabase/functions/manage-user/index.ts) is the server-side Edge Function used for staff account creation, updates, deactivation and password resets. Its privileged key is read from Supabase's server-side runtime; it is not in the frontend.
- The app's old Google Sheets frontend transport is disabled and retained as commented `.txt` references under `src/services/legacy/`. The existing Google Sheet itself is not changed.

**Not connected yet:** the SQL has not been run on your new Supabase project; the Edge Function has not been deployed there; no Supabase URL/key has been added to Vercel. The app will keep using Demo mode until those are done.

## What I need from you

1. Create the Supabase project and run the steps below.
2. Send me only these two **public** values (or put them into Vercel yourself and send me the deployment URL):
   - **Project URL** — `https://<project-ref>.supabase.co`
   - **Publishable key** — starts with `sb_publishable_...` (an older project may show a public `anon` key instead; that is also acceptable)
3. Tell me when you have created/promoted the first administrator and deployed `manage-user`.

The Supabase connector for this conversation is currently disconnected. You do not need it for the manual dashboard flow below; connect it via Arena's Apps panel only if you want me to access Supabase directly.

> **Never send:** database password, Supabase Secret key (`sb_secret_...`), legacy `service_role` key, login password, or a session/JWT token. The browser needs only the project URL and the public publishable key. Supabase describes publishable keys as client-side keys and secret keys as server-only credentials in its [API key guide](https://supabase.com/docs/guides/getting-started/api-keys).

---

## Step 1 — Create the Supabase project

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and sign in.
2. Choose **New project**.
3. Name it `Lumina Library` and choose a region near your users.
4. Create a strong database password. Save it in your own password manager—**do not paste it here**.
5. Create the project and wait until the dashboard reports it is ready.

## Step 2 — Install the database and public catalogue

1. In the project, open **SQL Editor** → **New query**.
2. Open `supabase/setup.sql` from this workspace/repository, copy the full file, paste it into the SQL Editor and click **Run**.
3. Confirm the query completes without an error. The setup is safe to re-run: seed rows use `ON CONFLICT DO NOTHING` and do not overwrite existing books/settings.

The file imports **book-level public metadata only**. It does not import members, emails, password hashes, loans, reservations or fines. Availability is derived from the Supabase loans table, so stale “copies on loan” numbers from the old sheet are deliberately ignored. The old spreadsheet stays untouched.

## Step 3 — Disable public account sign-up

1. Open **Authentication** → **Settings** (or **Sign In / Providers**, depending on the dashboard layout).
2. Turn **Allow new users to sign up** off and save.

This keeps arbitrary visitors from creating accounts. The app's staff-only Edge Function will create users through Supabase Auth Admin after it is deployed. Supabase documents this as the **Allow new users to sign up** setting in its [Auth configuration guide](https://supabase.com/docs/guides/auth/general-configuration).

## Step 4 — Create the first administrator

1. Open **Authentication** → **Users** → **Add user**.
2. Create the account using the administrator's email and a new strong password; mark/confirm the email as verified if the dialog offers that option.
3. Return to **SQL Editor** and run this query, replacing the email with the same email you just added:

```sql
update public.profiles
set role = 'ADMIN'
where lower(email) = lower('your-admin-email@example.com');

select user_code, email, role, account_status
from public.profiles
where lower(email) = lower('your-admin-email@example.com');
```

The `select` should show exactly one `ADMIN` row. If it shows zero rows, stop and tell me what the result says (do not paste a password).

## Step 5 — Deploy `manage-user` from the Dashboard editor

1. Open **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name the function exactly `manage-user`.
3. Replace the starter code with the contents of `supabase/functions/manage-user/index.ts` from this workspace/repository.
4. Keep **Verify JWT** enabled, then deploy.
5. In **Edge Functions** → **Secrets**, confirm the project provides its normal runtime key variables. The function reads the current `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` dictionaries, with older-key fallbacks. Do not add a browser-visible secret, and do not paste any secret into this chat.

The function sends a new opaque `sb_secret_...` key only in the `apikey` header (not as a Bearer JWT), while preserving the legacy `service_role` JWT behavior for older projects. Its incoming request still requires a signed-in user's Auth JWT; the handler checks that actor's role/status in the database before using its server-side Auth Admin client.

Supabase supports creating and deploying an Edge Function directly from the Dashboard's **Via Editor** flow; see its [Dashboard quickstart](https://supabase.com/docs/guides/functions/quickstart-dashboard). Keep **Verify JWT** enabled for this user-authenticated function.

## Step 6 — Copy the two public project values

In **Project Settings** → **API Keys** (or the project's **Connect** dialog), copy:

- the **Project URL**
- the **Publishable key** (the key labelled `sb_publishable_...`)

Send those two values to me here. They are public browser configuration—not the database password and not the Secret key. If you prefer not to paste them in chat, add them yourself in Step 7 and send me the live URL instead.

## Step 7 — Set Vercel environment variables and redeploy

In Vercel Dashboard → the **Lumina Library** project → **Settings** → **Environment Variables**, add:

| Name | Value | Environments |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | the Supabase Project URL | Production, Preview, Development |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the Supabase publishable key | Production, Preview, Development |

Save them. **Do not redeploy the old `main` build yet**—it still contains the previous frontend. Vite reads these at build time; the new Supabase frontend must be pushed first, and then Vercel can build it with these values.

For local development, the same two values go in the ignored `.env.local` file. Do not commit that file.

## Step 8 — Send me the public values; I'll verify before deployment

After Steps 1–6, send me:

- `VITE_SUPABASE_URL` (the project URL)
- `VITE_SUPABASE_PUBLISHABLE_KEY` (public key)
- confirmation that the SQL setup, first admin and `manage-user` function are in place

I will configure the ignored local environment file, run the frontend checks and verify the public catalogue, anonymous privacy boundary and signed-in RPC flow against your project. **I will not call it connected until those live checks pass.**

## Step 9 — Push the tested code and let Vercel build it

The project source on GitHub/Vercel still needs this Supabase change. Once the live checks pass, I can push the tested change to `main` using the previously agreed route. The earlier GitHub token was intentionally not retained, so if you want me to push, I will ask for a fresh short-lived, fine-grained token with write access to this repository. I use it only for the push and do not save it. Alternatively, you can apply changes through the GitHub browser UI, but that is more manual.

After the push, Vercel builds with the two environment variables from Step 7. I will verify the deployed URL before saying the migration is live.

## Existing people/loans: important migration note

This setup does **not** copy existing member accounts or circulation history. Supabase Auth cannot use the old Apps Script password hashes, so every person who needs a login must receive a new Supabase Auth account/password. The public book seed is separate and non-destructive. If you want members, loans or reservations moved later, tell me which records you authorize migrating; we will plan that explicitly rather than copying private spreadsheet rows by default.
