# Security notes

**Short version: this is prototype-grade authentication, not production identity.**
It is real hashing and real server-side session validation — not a fake login — but it
runs on Google Apps Script inside a spreadsheet and it is not a substitute for an identity
provider. Read section 5 before putting real student data in the sheet.

---

## 1. What is genuinely enforced

| Property | How |
| --- | --- |
| Passwords are never stored in plaintext | `hashPassword_()` — salted, iterated HMAC-SHA256 (2 000 rounds by default), stored with a per-user 32-hex-char salt and the iteration count. An older work factor is upgraded automatically on the next successful sign-in |
| Passwords never leave the server | `publicUser_()` projects an explicit field allow-list; hash, salt and iteration count are not in any response. Asserted in `api-smoke.mjs` |
| The role comes from the server | Read from the `Users` row on every request (`requireSession_`), never from the client |
| Deactivation takes effect immediately | `users.setStatus` marks every session row of that account `Revoked`, and `requireSession_` re-reads the account on every call. The next request therefore fails with `UNAUTHORIZED` ("Your session has ended. Sign in again.") rather than `FORBIDDEN` — the session is gone before the account status is even consulted, which is the stricter of the two answers |
| Sessions are opaque and revocable | 64-hex random token; only its SHA-256 is stored. Logout marks the row `Revoked = TRUE`; expired rows are pruned |
| Brute force is throttled | 8 attempts per identifier per 15 minutes → `RATE_LIMITED` |
| Only admins create admins | `createUser_` / `updateUser_` reject `role: ADMIN` for non-admins; no public self-registration action exists |
| Circulation is race-safe | `LockService` (`withLock_`) wraps issue/return/renew/reserve, so two concurrent issues cannot both pass the availability check |
| Impossible states are rejected | no negative availability, no double return, no renewing a returned loan, no duplicate reservation, no duplicate email/ID, no two copies of one title per member |
| Formula injection is neutralised | every string written to the sheet is prefixed with `'` when it starts with `= + - @`, so a title like `=HYPERLINK(...)` is stored as text (verified in `api-smoke.mjs`) |
| Errors leak nothing | `appError_` returns a code + human message; stack traces, sheet names and tokens are caught in `doPost` and replaced with `SERVER_ERROR` |
| No secrets in the browser | the bundle contains only the public `/exec` URL; there is no API key, service account or sheet credential in the client |
| Sheet writes are not open to the world | the browser cannot write to the Sheet at all — writes only exist behind an authenticated Apps Script action |

## 2. What is *not* production-grade

| Limitation | Why | Impact |
| --- | --- | --- |
| Hand-rolled password KDF | Apps Script has no PBKDF2, scrypt or argon2, and no WebCrypto digests | 2 000 HMAC rounds is far weaker than argon2id, and the count is limited by Google: every round is a remote call at roughly 2 ms, so the 12 000 rounds this project started with made a single sign-in take **25 seconds** — measured on the live deployment, past the browser timeout. 2 000 keeps sign-in near 4 s. A leaked `Users` tab is crackable with effort. Use a real IdP before trusting it. |
| Tokens in `localStorage` when "remember me" is on | chosen for a static SPA with no cookie infrastructure | XSS in the app would expose the token. CSP + a token in an HttpOnly cookie belongs to a real deployment. |
| No CSRF token | the API is a CORS-simple JSON POST with a bearer token in the body and no cookies | acceptable for this shape; would be needed the moment cookies are introduced |
| Session table in a spreadsheet | the sheet is the only database available | session lookups are O(rows); fine at library scale (hundreds), not at campus scale |
| Rate limiting is per-identifier, in-sheet | no shared cache | a distributed attacker can still try many identifiers |
| No password complexity policy beyond length | prototype | 8 characters minimum only |
| Trial by spreadsheet | anyone with edit rights to the Sheet can change any row, including a password hash | **share the sheet only with the Apps Script owner.** Sheet access = database access. |
| Timing | string comparison of hashes is not constant-time | negligible for a prototype, noted for completeness |

## 3. Deployment checklist

- [ ] Deploy the Web App as **Execute as: me**, **Access: anyone** — "anyone" is required
      for `fetch` to reach it, but every non-`health`/`auth.*` action still requires a
      valid token.
- [ ] Keep the spreadsheet **private** (only the deploying account). Do not restore the
      public link-sharing that existed when it was a static catalogue.
- [ ] Set `SPREADSHEET_ID`, `SEED_ADMIN_EMAIL` and (optionally) `EMAIL_DOMAIN` in
      *Project Settings → Script properties*.
- [ ] Run `setupLumina()` once, then `verifyLuminaSetup()`.
- [ ] Sign in as the seeded admin and change that password immediately
      (`auth.changePassword` via the API, or `users.resetPassword`).
- [ ] Set `EMAIL_DOMAIN` to your campus domain to reject outside addresses.
- [ ] Re-check `Access: anyone` after every redeploy — Apps Script resets it if you
      deploy a new version with different settings.

## 4. What the client protects against (and what it does not)

The React app hides controls a role cannot use, guards routes, and never trusts a
client-side role. That is usability, not security: anyone can call the `/exec` URL
directly. **Every authorisation decision is repeated server-side** — that is the only
reason the demo's hiding of buttons is not the whole story.

## 5. Honest statement for the report

> Authentication in this prototype is implemented, not simulated: passwords are salted
> and hashed, sessions are validated server-side on every request, roles are read from
> the backend, and logout revokes the token. It is nevertheless **prototype-grade** —
> a hand-rolled iterated-HMAC password hash on Apps Script, tokens in browser storage,
> and a spreadsheet as the session store. It is not suitable for production student
> records without moving identity to a managed provider (Google Workspace SSO, Auth0,
> Cognito) and the data to a real database.
