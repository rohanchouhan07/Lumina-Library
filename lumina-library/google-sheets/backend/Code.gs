/**
 * Code.gs — API router for Lumina Library.
 *
 * Contract
 *   POST  {API_URL}                body: JSON { action, token?, payload? }
 *   GET   {API_URL}?action=health  → lightweight health JSON
 *   Response: { ok: true, data } | { ok: false, error: { code, message } }
 *
 * The frontend sends `text/plain` so the request stays a CORS "simple request".
 * Roles are resolved from the Users sheet on every call — never from the body.
 */
var ACTIONS = {
  /* public */
  health: { auth: false, handler: function () { return health_(); } },
  'auth.login': { auth: false, handler: function (payload) { return authLogin_(payload); } },
  // Signed-out visitors of the public site need the catalogue; no member data crosses this line.
  'catalogue.public': { auth: false, handler: function (payload) { return publicCatalogue_(payload); } },

  /* session */
  'auth.session': { auth: true, handler: function (auth) { return { user: publicUser_(auth.user) }; } },
  'auth.logout': { auth: true, handler: authLogout_ },
  'auth.changePassword': { auth: true, handler: authChangePassword_ },

  /* bootstrap + reads */
  bootstrap: { auth: true, handler: bootstrap_ },
  'books.list': { auth: true, handler: function (auth, payload) { return listBooks_(payload); } },
  'books.get': { auth: true, handler: function (auth, payload) { return getBook_(payload); } },
  'users.list': { auth: true, handler: listUsers_ },
  'users.me': { auth: true, handler: function (auth) { return { user: publicUser_(auth.user) }; } },
  'users.updateProfile': { auth: true, handler: updateOwnProfile_ },
  'loans.list': { auth: true, handler: listLoans_ },
  'reservations.list': { auth: true, handler: listReservations_ },
  'wishlist.list': { auth: true, handler: function (auth) { return listWishlist_(auth); } },
  'wishlist.toggle': { auth: true, handler: toggleWishlist_ },
  'settings.get': { auth: true, handler: getSettings_ },
  'reports.dashboard': { auth: true, handler: function (auth) { return dashboardStats_(auth); } },
  'reports.analytics': { auth: true, handler: function (auth, payload) { return analytics_(auth, payload); } },
  'activity.list': { auth: true, handler: listActivity_ },
  'system.diagnostics': { auth: true, handler: diagnostics_ },

  /* admin mutations */
  'books.create': { auth: true, handler: createBook_ },
  'books.update': { auth: true, handler: updateBook_ },
  'books.archive': { auth: true, handler: archiveBook_ },
  'books.delete': { auth: true, handler: deleteBook_ },
  'users.create': { auth: true, handler: createUser_ },
  'users.update': { auth: true, handler: updateUser_ },
  'users.setStatus': { auth: true, handler: setUserStatus_ },
  'users.resetPassword': { auth: true, handler: resetUserPassword_ },
  'settings.update': { auth: true, handler: updateSettings_ },

  /* circulation */
  'loans.issue': { auth: true, handler: issueLoan_ },
  'loans.return': { auth: true, handler: returnLoan_ },
  'loans.renew': { auth: true, handler: renewLoan_ },
  'reservations.create': { auth: true, handler: createReservation_ },
  'reservations.cancel': { auth: true, handler: cancelReservation_ },
};

function doPost(e) {
  var body = {};
  try {
    body = parseBody_(e);
  } catch (err) {
    return json_(fail_(ERR.VALIDATION, 'Request body must be valid JSON.'));
  }
  var action = String(body.action || '');
  var entry = ACTIONS[action];
  if (!entry) return json_(fail_('UNKNOWN_ACTION', 'Unknown action: ' + sanitizeText_(action, 60)));

  try {
    // Every handler result is wrapped in the { ok, data } envelope.
    if (!entry.auth) return json_(ok_(entry.handler(body.payload || {}, body)));
    var auth = requireSession_(body.token);
    return json_(ok_(entry.handler(auth, body.payload || {}, body)));
  } catch (err) {
    logError_(action, err);
    return json_(failFromError_(err));
  }
}

/**
 * GET is a browser-friendly probe only: ?action=health (default) or ?action=ping.
 * Every data action is a POST so nothing is mutated by a link.
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'health';
  if (action === 'ping') {
    return json_(ok_({ pong: true, service: 'lumina-library-api', version: CONFIG.VERSION, time: new Date().toISOString() }));
  }
  if (action !== 'health') {
    return json_(fail_('UNKNOWN_ACTION', 'GET only supports ?action=health or ?action=ping. Use POST for data actions.'));
  }
  try {
    return json_(ok_(health_()));
  } catch (err) {
    logError_('health', err);
    return json_(failFromError_(err));
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  var text = e.postData.contents;
  try {
    return JSON.parse(text);
  } catch (err) {
    if (e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
    throw err;
  }
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

/** Safe health probe: no user data, no identifiers beyond tab names. */
function health_() {
  var book = spreadsheet_();
  var tabs = book.getSheets().map(function (sheet) {
    return sheet.getName();
  });
  var counts = {};
  try {
    ['BOOKS', 'USERS', 'LOANS', 'RESERVATIONS'].forEach(function (kind) {
      var table = readTable_(kind, CONFIG.SHEETS[kind]);
      counts[kind.toLowerCase()] = table.rows.length;
    });
  } catch (err) {
    counts.error = 'Some tabs could not be read.';
  }
  return {
    service: 'lumina-library-api',
    version: CONFIG.VERSION,
    // The spreadsheet id is deliberately not returned from a public endpoint.
    tabs: tabs,
    counts: counts,
    time: new Date().toISOString(),
  };
}

/** One call that gives the frontend everything it needs after login, scoped by role. */
function bootstrap_(auth) {
  var role = normaliseRole_(auth.user.Role);
  var staff = isStaff_(role);
  var books = listBooks_({}).books;
  var loans = listLoans_(auth, {}).loans;
  var reservations = listReservations_(auth, {}).reservations;
  var users = staff ? listUsers_(auth, {}).users : [publicUser_(auth.user)];
  var settings = readSettings_().settings;
  var activity = listActivity_(auth, { limit: 40 }).activity;
  var wishlist = listWishlist_(auth).wishlist;

  return {
    user: publicUser_(auth.user),
    role: role,
    scope: staff ? 'ALL' : 'SELF',
    books: books,
    users: users,
    loans: loans,
    reservations: reservations,
    settings: settings,
    activity: activity,
    wishlist: wishlist,
    stats: dashboardStats_(auth),
    serverTime: new Date().toISOString(),
  };
}

/**
 * ADMIN-only structural report: which tab backs each logical table, whether the
 * canonical headers are present, and how many rows each holds. Read-only.
 */
function diagnostics_(auth) {
  requireRole_(auth, [ROLES.ADMIN]);
  var book = spreadsheet_();
  var tables = {};
  Object.keys(CONFIG.SHEETS).forEach(function (kind) {
    var sheet = findSheet_(kind, CONFIG.SHEETS[kind]);
    if (!sheet) {
      tables[kind.toLowerCase()] = { ok: false, tab: null, missing: CONFIG.HEADERS[kind] };
      return;
    }
    var headers = readHeaderRow_(sheet);
    var headerKeys = headers.map(headerKey_);
    var missing = CONFIG.HEADERS[kind].filter(function (header) {
      return headerKeys.indexOf(headerKey_(header)) === -1;
    });
    tables[kind.toLowerCase()] = {
      ok: missing.length === 0,
      tab: sheet.getName(),
      rows: Math.max(0, sheet.getLastRow() - 1),
      columns: headers.length,
      missing: missing,
    };
  });
  var staleSessions = readTable_('SESSIONS', CONFIG.SHEETS.SESSIONS).rows.filter(function (row) {
    return new Date(row['Expires at']).getTime() < Date.now();
  }).length;
  return {
    service: 'lumina-library-api',
    version: CONFIG.VERSION,
    spreadsheet: book.getName(),
    user: String(auth.user.Email),
    role: normaliseRole_(auth.user.Role),
    timezone: book.getSpreadsheetTimeZone(),
    tables: tables,
    sessions: { expired: staleSessions },
    settings: readSettings_().settings,
    time: new Date().toISOString(),
  };
}

/**
 * Error logging. Apps Script has no log service beyond Stackdriver, so the full
 * detail goes to the execution log and only a sanitised code+message reaches the
 * client. Never logs passwords, tokens or hashes.
 */
function logError_(action, err) {
  try {
    var code = err && err.appCode ? err.appCode : ERR.SERVER;
    var message = err && err.message ? String(err.message) : 'unknown';
    // Strip anything that looks like a secret before it reaches the log.
    message = message.replace(/[A-Za-z0-9_\-]{32,}/g, '<redacted>');
    console.error('[lumina-api] action=' + sanitizeText_(action || 'unknown', 60) + ' code=' + code + ' message=' + message);
  } catch (ignored) {
    // Logging must never break a request.
  }
}
