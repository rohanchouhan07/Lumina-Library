/**
 * Config.gs — server-side configuration.
 * No secrets live in the frontend. Everything privileged is here or in
 * Script Properties (Project Settings → Script properties).
 */
var CONFIG = (function () {
  var props = PropertiesService.getScriptProperties();
  return {
    VERSION: '2.2.0',
    /** Data store. Falls back to the bound spreadsheet when the script is container-bound. */
    SPREADSHEET_ID: props.getProperty('SPREADSHEET_ID') || '18CGNA07OgL0TAH4mCVKz94AwQGx_Jc1jA2b_e-TfL3s',
    /** Optional domain restriction, e.g. 'college.edu'. Empty = any domain. */
    EMAIL_DOMAIN: props.getProperty('EMAIL_DOMAIN') || '',
    /** Session lifetime in hours. "Remember me" multiplies by REMEMBER_MULTIPLIER. */
    SESSION_HOURS: Number(props.getProperty('SESSION_HOURS') || 12),
    REMEMBER_MULTIPLIER: 30,
    /**
     * Password hashing work factor.
     *
     * Apps Script has no PBKDF2/argon2 and every hash round is a separate remote call
     * (~2 ms), so 12 000 rounds made a single sign-in take ~25 s — past the browser's
     * request timeout. 2 000 rounds keeps sign-in near 4 s while still defeating a
     * plain rainbow-table attack. This is deliberately weak for a password KDF and is
     * documented as prototype-grade; raise it via the HASH_ITERATIONS script property
     * only if you can also raise the client timeout.
     */
    HASH_ITERATIONS: Number(props.getProperty('HASH_ITERATIONS') || 2000),
    MIN_PASSWORD_LENGTH: 8,
    /** Brute-force throttling: attempts allowed per identifier per window. */
    LOGIN_MAX_ATTEMPTS: 8,
    LOGIN_WINDOW_MINUTES: 15,
    /** Demo circulation policy defaults, only used when the Settings tab lacks a key. */
    DEFAULT_SETTINGS: {
      library_name: 'Lumina Central Library',
      loan_duration_days: '14',
      max_renewals: '2',
      renewal_extension_days: '14',
      fine_per_day: '5',
      student_borrow_limit: '4',
      faculty_borrow_limit: '8',
      reservation_hold_days: '3',
      allow_self_checkout: 'false',
      block_issue_on_unpaid_fines: 'false',
      fine_block_threshold: '100',
    },
    SHEETS: {
      BOOKS: 'Books',
      USERS: 'Users',
      LOANS: 'Loans',
      RESERVATIONS: 'Reservations',
      ACTIVITY: 'ActivityLogs',
      SETTINGS: 'Settings',
      SESSIONS: 'Sessions',
      WISHLISTS: 'Wishlists',
    },
    HEADERS: {
      BOOKS: [
        'Book ID', 'Title', 'Author', 'ISBN', 'Publisher', 'Year', 'Category', 'Shelf',
        'Total copies', 'Copies on loan', 'Available copies', 'Status', 'Added',
        'Description', 'Cover image URL', 'Created at', 'Updated at',
      ],
      USERS: [
        'User ID', 'Name', 'Email', 'Institutional ID', 'Role', 'Department', 'Account status',
        'Password hash', 'Password salt', 'Hash iterations', 'Phone', 'Borrowing limit',
        'Created at', 'Updated at',
      ],
      LOANS: [
        'Loan ID', 'Book ID', 'User ID', 'Issued by', 'Issue date', 'Due date', 'Return date',
        'Loan status', 'Renewal count', 'Fine amount', 'Created at', 'Updated at',
      ],
      RESERVATIONS: [
        'Reservation ID', 'Book ID', 'User ID', 'Reservation date', 'Queue position',
        'Reservation status', 'Expiry date', 'Created at', 'Updated at',
      ],
      ACTIVITY: ['Activity ID', 'Actor user ID', 'Action', 'Entity type', 'Entity ID', 'Timestamp', 'Summary'],
      SETTINGS: ['Key', 'Value', 'Updated at'],
      SESSIONS: ['Token hash', 'User ID', 'Created at', 'Expires at', 'Last seen', 'Revoked'],
      WISHLISTS: ['User ID', 'Book ID', 'Created at'],
    },
  };
})();

/**
 * How a legacy tab is recognised when it does not carry the canonical tab name.
 * `KEYS` must all be present in the header row; `NOT` must be absent. Together
 * they stop e.g. the Loans tab being mistaken for Wishlists (both carry a
 * "User ID" column). Matching never renames or rewrites a tab.
 */
var SHEET_MATCH = {
  BOOKS: { KEYS: ['Book ID', 'Title'], NOT: [] },
  USERS: { KEYS: ['User ID', 'Email', 'Password hash'], NOT: ['Loan ID'] },
  LOANS: { KEYS: ['Loan ID', 'Book ID', 'Due date'], NOT: [] },
  RESERVATIONS: { KEYS: ['Reservation ID', 'Book ID'], NOT: ['Loan ID'] },
  ACTIVITY: { KEYS: ['Activity ID', 'Summary'], NOT: [] },
  SETTINGS: { KEYS: ['Key', 'Value'], NOT: ['Book ID', 'User ID'] },
  SESSIONS: { KEYS: ['Token hash'], NOT: [] },
  WISHLISTS: { KEYS: ['User ID', 'Book ID', 'Created at'], NOT: ['Loan ID', 'Reservation ID', 'Password hash'] },
};

/** Roles are normalised to these three values everywhere. */
/**
 * Roles.
 *   ADMIN     — everything, including policy and other administrators.
 *   LIBRARIAN — runs the desk: inventory, members, circulation, holds, reports.
 *               Cannot change circulation policy, read diagnostics or touch ADMIN accounts.
 *   FACULTY   — borrower with a higher limit.
 *   STUDENT   — borrower.
 */
var ROLES = { ADMIN: 'ADMIN', LIBRARIAN: 'LIBRARIAN', FACULTY: 'FACULTY', STUDENT: 'STUDENT' };
var ROLE_LIST = [ROLES.ADMIN, ROLES.LIBRARIAN, ROLES.FACULTY, ROLES.STUDENT];
/** Roles that may be assigned by someone who is not an administrator. */
var ASSIGNABLE_BY_LIBRARIAN = [ROLES.LIBRARIAN, ROLES.FACULTY, ROLES.STUDENT];
var STATUS = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' };

function spreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var bound = props.getProperty('SPREADSHEET_ID');
  if (bound) return SpreadsheetApp.openById(bound);
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
}
