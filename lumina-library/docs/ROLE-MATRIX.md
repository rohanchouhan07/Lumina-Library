# Role matrix

Four roles, normalised on both sides:

| Sheet / API | UI (`Role`) | Who they are |
| --- | --- | --- |
| `ADMIN` | `admin` | Library administrator. Everything, including accounts and policy. |
| `LIBRARIAN` | `librarian` | Desk staff. Inventory, members, circulation, holds, reports. Not policy, not administrators. |
| `FACULTY` | `faculty` | Teaching staff. Catalogue, own circulation, own analytics, holds. |
| `STUDENT` | `student` | Learner. Catalogue, own circulation, holds, wishlist. |

Normalisation happens in `normaliseRole_` (`AuthService.gs`): `LIBRARIAN`, `STAFF` and
`DESK` are all read as `LIBRARIAN`; `TEACHER` is read as `FACULTY`; `ADMINISTRATOR` as
`ADMIN`. Anything unrecognised becomes `STUDENT`, so a typo in the sheet can never grant
rights. `mapRole()` / `toApiRole()` in `src/services/mappers.ts` translate between the API
value and the UI's lowercase name in both directions.

**The role always comes from the backend.** It is read from the `Users` tab when the
session is validated (`bootstrap` returns `user.role`), never from localStorage, a URL
parameter or a checkbox. The client-side `can()` matrix only hides controls; the server
re-checks every action and answers `FORBIDDEN` regardless of what the UI shows.

---

## Capabilities

| Capability | ADMIN | LIBRARIAN | FACULTY | STUDENT |
| --- | :--: | :--: | :--: | :--: |
| Browse catalogue / book details | ✅ | ✅ | ✅ | ✅ |
| Create, edit, archive titles | ✅ | ✅ | — | — |
| Delete titles | ✅ (only if never borrowed) | — | — | — |
| View all members | ✅ | ✅ | — | — |
| Create accounts | ✅ (any role) | ✅ (student, faculty, librarian) | — | — |
| Edit member records / reset password | ✅ | ✅ (never an ADMIN) | — | — |
| Deactivate / reactivate accounts | ✅ | ✅ (never an ADMIN) | — | — |
| Issue a copy for anyone | ✅ | ✅ | — | — |
| Self-checkout (own loans) | ✅ | ✅\* | ✅\* | ✅\* |
| Return books (process desk returns) | ✅ | ✅ | — | — |
| Renew own loan | ✅ | ✅ | ✅ | ✅ |
| Renew someone else's loan | ✅ | ✅ | — | — |
| View all reservations | ✅ | ✅ | ✅\*\* | — |
| Cancel someone else's hold | ✅ | ✅ | — | — |
| Place / cancel own hold | ✅ | ✅ | ✅ | ✅ |
| Wishlist | ✅ | ✅ | ✅ | ✅ |
| Library-wide analytics | ✅ | ✅ | ✅\*\* | — |
| Own borrowing analytics | ✅ | ✅ | ✅ | ✅ |
| Edit circulation policy | ✅ | — | — | — |
| System diagnostics | ✅ | — | — | — |
| Interface preferences | ✅ | ✅ | ✅ | ✅ |
| Reset demo data | ✅ (demo mode only) | — | — | — |
| View activity log | ✅ | ✅ | own entries only | own entries only |

\*\* Faculty see library-wide reservations and analytics only in the sense of read-only
scope; they cannot act on another member's record.

\* Self-checkout requires `allow_self_checkout = true` in the `Settings` tab
(default `false`). When it is off, the API answers `FORBIDDEN` with
"Self checkout is disabled. Ask library staff to issue this book." and the UI shows that
message verbatim — it never fakes a successful issue.

---

## Screen access

| Route | ADMIN | FACULTY | STUDENT |
| --- | :--: | :--: | :--: |
| `/`, `/catalog`, `/books/:id` | public | public | public |
| `/login` | public (redirects to `/app` when signed in) | same | same |
| `/app` Dashboard | ✅ overview | ✅ overview | ✅ personal |
| `/app/books` | ✅ manage | 👁 view | 👁 view |
| `/app/members` | ✅ | ⛔ redirect + explain | ⛔ |
| `/app/loans` | ✅ all loans | ✅ all (read) + own renew | ✅ own loans |
| `/app/reservations` | ✅ all | ✅ all (read) | ✅ own |
| `/app/reports` | ✅ | ✅ | ⛔ |
| `/app/profile` | ✅ | ✅ | ✅ |
| `/app/settings` | ✅ policy + prefs + connection | ✅ prefs + connection | ✅ prefs + connection |

Blocked routes render an explanatory empty state ("This area is restricted — your
`student` role does not have access to this screen"), not a blank page or a redirect
loop.

The same matrix is asserted in `tests/` for the frontend and in
`qa-tools/api-smoke.mjs` for the backend (student `books.create` → `FORBIDDEN`,
`users.list` → `FORBIDDEN`, `loans.return` → `FORBIDDEN`, `settings.update` →
`FORBIDDEN`, `reports.analytics` → `SELF` scope; missing or revoked token →
`UNAUTHORIZED`).
