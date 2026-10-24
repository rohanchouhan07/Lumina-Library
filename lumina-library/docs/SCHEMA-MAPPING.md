# Sheet schema & field mapping

Everything the app shows comes from the spreadsheet; everything it changes is written
back to it. This document is the contract between the sheet, the Apps Script backend and
the React types.

---

## 1. What already existed (audit, before any change)

The linked spreadsheet is `18CGNA07OgL0TAH4mCVKz94AwQGx_Jc1jA2b_e-TfL3s`.

Read through the public `gviz` endpoint (`/gviz/tq?tqx=out:csv&gid=…`), the sheet
contained:

| Tab | gid | Contents found | Action taken |
| --- | --- | --- | --- |
| first tab (books) | `0` | **13 columns**: `Book ID, Title, Author, ISBN, Publisher, Year, Category, Shelf, Total copies, Copies on loan, Available copies, Status, Added` — plus one placeholder row `BK101` | **Preserved.** The backend appends its three extra columns (`Description`, `Cover image URL`, `Created at`/`Updated at`) to the right; existing columns, order and the `BK101` row are left untouched. |
| second tab | `692427571` | completely empty | Left alone; not used. |

No `Users`, `Loans`, `Reservations`, `Settings` or `Sessions` tabs existed publicly, so
authentication columns could not have existed either — the 13-column books sheet is a
catalogue export, not an auth store.

**Nothing was deleted, renamed or reordered.** New tabs are created by
`Setup.gs → setupLumina()`; existing ones are only ever appended to, and only for the
columns that do not exist yet.

---

## 2. Tabs the backend uses

Tab names live in `Config.gs → CONFIG.SHEETS`.

| Tab | Purpose | Written when |
| --- | --- | --- |
| `Books` | Catalogue + derived availability columns | admin creates/updates/archives a title, circulation changes |
| `Users` | Accounts, roles, salted password hashes | admin creates/updates/deactivates a member |
| `Loans` | One row per loan | issue, return, renew |
| `Reservations` | Hold queue | create/cancel/fulfil/expire |
| `ActivityLogs` | Append-only audit trail | every mutation, sign-in and sign-out |
| `Settings` | `Key`/`Value` policy store | admin saves circulation policy |
| `Sessions` | Hashed session tokens | login, logout, refresh |
| `Wishlists` | `User ID` + `Book ID` saved titles | wishlist toggle |

The backend finds a tab by **header signature** (at least three canonical headers), not
by position, so re-ordering tabs or renaming them in the UI does not break it — but a
renamed *header* does. `verifyLuminaSetup()` reports mismatches.

---

## 3. Column-by-column mapping

### `Books`

| Sheet column | Backend field | API field | React type (`src/types/index.ts`) | Notes |
| --- | --- | --- | --- | --- |
| `Book ID` | `Book ID` | `bookId` | `Book.id` | `BK-001` style, generated when blank |
| `Title` | `Title` | `title` | `Book.title` | required, duplicate titles → `CONFLICT` |
| `Author` | `Author` | `author` | `Book.author` | defaults to `Unknown author` when blank |
| `ISBN` | `ISBN` | `isbn` | `Book.isbn` | free text, not validated as ISBN-13 |
| `Publisher` | `Publisher` | `publisher` | `Book.publisher` | |
| `Year` | `Year` | `year` | `Book.year` | numeric |
| `Category` | `Category` | `category` | `Book.category` | drives the category chart |
| `Shelf` | `Shelf` | `shelfLocation` | `Book.shelf` | |
| `Total copies` | `Total copies` | `totalCopies` | `Book.totalCopies` | ≥ 1, cannot drop below active loans |
| `Copies on loan` | derived | `copiesOnLoan` | *(derived in UI)* | recomputed on every read |
| `Available copies` | derived | `availableCopies` | *(derived in UI)* | `total − onLoan`, never negative |
| `Status` | `Status` | `recordStatus` | `Book.status` | `ACTIVE` / `ARCHIVED` → `active` / `archived` |
| `Added` | `Added` | `createdAt` | `Book.addedAt` | pre-existing catalogue date |
| `Description` | `Description` | `description` | `Book.description` | new column, appended |
| `Cover image URL` | `Cover image URL` | `coverImageUrl` | `Book.coverImageUrl` | optional |
| `Created at` | `Created at` | `createdAt` | `Book.addedAt` fallback | |
| `Updated at` | `Updated at` | `updatedAt` | `Book.syncUpdatedAt` | |

The UI's gradient book covers are generated from `seedFromId(bookId)`, so a real
`Cover image URL` is used when present and the generated art otherwise — no external
image requests.

### `Users`

| Sheet column | API field | React type | Notes |
| --- | --- | --- | --- |
| `User ID` | `userId` | `Member.id` | `U-0001` style |
| `Name` | `name` | `Member.name` | |
| `Email` | `email` | `Member.email` | unique, lower-cased |
| `Institutional ID` | `institutionalId` | — | unique; also accepted at sign-in (`M-1004`) |
| `Role` | `role` | `Member.role` | `ADMIN` \| `FACULTY` \| `STUDENT` → `admin` \| `faculty` \| `student` |
| `Department` | `department` | `Member.department` | |
| `Account status` | `accountStatus` | `Member.status` | `ACTIVE` \| `INACTIVE` → `active` \| `inactive` |
| `Password hash` | — | **never sent** | iterated HMAC-SHA256, hex |
| `Password salt` | — | **never sent** | 16 random bytes, hex |
| `Hash iterations` | — | **never sent** | stored so the work factor can be raised later |
| `Phone` | `phone` | `Member.phone` | |
| `Borrowing limit` | `borrowingLimit` | `Member.borrowingLimit` | blank = role default from `Settings` |
| `Created at` / `Updated at` | `createdAt` / `updatedAt` | `Member.joinedAt` | |

### `Loans`

| Sheet column | API field | React type | Notes |
| --- | --- | --- | --- |
| `Loan ID` | `loanId` | `Loan.id` | `LN-0001` |
| `Book ID` | `bookId` | `Loan.bookId` | |
| `User ID` | `userId` | `Loan.memberId` | |
| `Issued by` | `issuedBy` | `Loan.issuedBy` | name of the acting user |
| `Issue date` | `issueDate` | `Loan.issuedAt` | ISO |
| `Due date` | `dueDate` | `Loan.dueAt` | ISO, `issue + loan_duration_days` |
| `Return date` | `returnDate` | `Loan.returnedAt` | empty while active |
| `Loan status` | `loanStatus` | `Loan.status` | `ACTIVE` \| `RETURNED` → `active` \| `returned` |
| `Renewal count` | `renewalCount` | `Loan.renewals` | |
| `Fine amount` | `fineAmount` | `Loan.fineAmount` | ₹, **simulated** — written on return |

### `Reservations`

| Sheet column | API field | React type |
| --- | --- | --- |
| `Reservation ID` | `reservationId` | `Reservation.id` |
| `Book ID` | `bookId` | `Reservation.bookId` |
| `User ID` | `userId` | `Reservation.memberId` |
| `Reservation date` | `reservationDate` | `Reservation.createdAt` |
| `Queue position` | `queuePosition` | derived for display |
| `Reservation status` | `reservationStatus` | `PENDING` \| `READY` \| `FULFILLED` \| `CANCELLED` \| `EXPIRED` → `pending` \| `ready` \| `fulfilled` \| `cancelled` \| `expired` |
| `Expiry date` | `expiryDate` | `Reservation.expiresAt` |
| `Created at` / `Updated at` | | `readyAt` / `fulfilledAt` / `cancelledAt` |

### `Settings`

`Key` / `Value` / `Updated at`. Keys map to `LibraryConfig`
(`src/types/index.ts`) through `fromConfig` / `toConfig` in `src/services/mappers.ts`:

| Sheet key | Config field | Default |
| --- | --- | --- |
| `library_name` | `libraryName` | Lumina Central Library |
| `loan_duration_days` | `loanDurationDays` | 14 |
| `max_renewals` | `maxRenewals` | 2 |
| `renewal_extension_days` | `renewalExtensionDays` | 14 |
| `fine_per_day` | `finePerDay` | 5 (₹, simulated) |
| `student_borrow_limit` | `studentBorrowLimit` | 4 |
| `faculty_borrow_limit` | `facultyBorrowLimit` | 8 |
| `reservation_hold_days` | `reservationHoldDays` | 3 |
| `allow_self_checkout` | `allowSelfCheckout` | false |
| `block_issue_on_unpaid_fines` | `blockIssueOnUnpaidFines` | false |
| `fine_block_threshold` | `fineBlockThreshold` | 100 |

### `ActivityLogs`

`Activity ID`, `Actor user ID`, `Action` (`loan.issued`, `book.created`, …),
`Entity type`, `Entity ID`, `Timestamp`, `Summary` → `ActivityEntry`
(`kind`, `message`, `actor`, `memberId`, `at`). The UI's activity feed maps server
actions onto its existing `ActivityKind` union in `mappers.ts`; unknown actions fall
back to `system`.

### `Sessions` / `Wishlists`

| Tab | Columns | Note |
| --- | --- | --- |
| `Sessions` | `Token hash`, `User ID`, `Created at`, `Expires at`, `Last seen`, `Revoked` | the raw token is never stored — only its SHA-256 |
| `Wishlists` | `User ID`, `Book ID`, `Created at` | unique pair |

---

## 4. Round-trip guarantees

1. **Sheet → UI.** `bootstrap` and every refresh pass raw rows through
   `toLibraryData()` (`src/services/mappers.ts`). Numbers are coerced, blanks get
   defaults, and unknown enum values degrade safely instead of crashing a screen.
2. **UI → sheet.** A mutation posts an action, the backend validates and writes, then
   the client re-reads `bootstrap`. **The UI only shows what the sheet accepted** — a
   failed write returns `{ ok: false }`, shows an error toast, and leaves the previous
   row visible.
3. **Typing in the sheet.** Rows edited by hand appear after the next refresh
   (sign-in, manual *Refresh now*, or the two-minute poll). There is no live push and
   the UI never claims otherwise.
4. **Derived columns.** `Copies on loan`, `Available copies` and `Status` are recomputed
   on read; a hand-edited value in those columns is overwritten on the next circulation
   event rather than trusted.
