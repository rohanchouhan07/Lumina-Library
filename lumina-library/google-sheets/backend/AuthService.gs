/**
 * AuthService.gs — password hashing, sessions and role checks.
 *
 * Security model (documented in docs/SECURITY.md):
 *  • Passwords: salted, iterated HMAC-SHA256 (Apps Script has no PBKDF2/argon2).
 *  • Sessions: opaque random token, only its SHA-256 hash is stored in the sheet.
 *  • Roles: always read from the Users sheet on every request — never from the client.
 *  • Everything runs with the deploying account's permissions; the sheet itself is
 *    never reachable from the browser except through these service functions.
 */
var SESSION_ACTIONS = {};

function hashPassword_(password, salt, iterations) {
  var rounds = iterations || CONFIG.HASH_ITERATIONS;
  var value = salt + ':' + password;
  for (var i = 0; i < rounds; i += 1) {
    var bytes = Utilities.computeHmacSha256Signature(value, salt + ':' + i, Utilities.Charset.UTF_8);
    value = bytes
      .map(function (b) {
        return ('0' + (b & 0xff).toString(16)).slice(-2);
      })
      .join('');
  }
  return value;
}

function newSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
}

function newToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/* ------------------------------------------------------------------ sessions */

function pruneSessions_(rows) {
  var now = Date.now();
  return rows.filter(function (row) {
    var expires = new Date(row['Expires at']).getTime();
    var revoked = String(row.Revoked).toUpperCase() === 'TRUE';
    return !revoked && !isNaN(expires) && expires > now;
  });
}

function createSession_(userId, remember) {
  var hours = CONFIG.SESSION_HOURS * (remember ? CONFIG.REMEMBER_MULTIPLIER : 1);
  var token = newToken_();
  var now = new Date();
  var expires = new Date(now.getTime() + hours * 3600 * 1000);
  var store = readTable_('SESSIONS', CONFIG.SHEETS.SESSIONS);
  // Prune expired rows so the tab does not grow forever.
  var keep = pruneSessions_(store.rows);
  if (keep.length !== store.rows.length) {
    var dead = store.rows.filter(function (row) {
      return keep.indexOf(row) === -1;
    });
    dead
      .sort(function (a, b) {
        return b._row - a._row;
      })
      .forEach(function (row) {
        store.sheet.deleteRow(row._row);
      });
  }
  appendRecord_(store.sheet, store.headers, {
    'Token hash': sha256Hex_(token),
    'User ID': userId,
    'Created at': now.toISOString(),
    'Expires at': expires.toISOString(),
    'Last seen': now.toISOString(),
    Revoked: 'FALSE',
  });
  return { token: token, expiresAt: expires.toISOString() };
}

/** Revoke every session for a user except the one making the request. */
function revokeOtherSessions_(userId, keepToken) {
  var keepHash = keepToken ? sha256Hex_(keepToken) : '';
  var store = readTable_('SESSIONS', CONFIG.SHEETS.SESSIONS);
  var revoked = 0;
  store.rows.forEach(function (row) {
    if (String(row['User ID']) !== userId) return;
    if (String(row.Revoked).toUpperCase() === 'TRUE') return;
    if (keepHash && String(row['Token hash']) === keepHash) return;
    updateRecord_(store.sheet, store.headers, row._row, { Revoked: 'TRUE' });
    revoked += 1;
  });
  return revoked;
}

function revokeSession_(token) {
  if (!token) return;
  var store = readTable_('SESSIONS', CONFIG.SHEETS.SESSIONS);
  var hash = sha256Hex_(token);
  store.rows.forEach(function (row) {
    if (String(row['Token hash']) === hash) {
      updateRecord_(store.sheet, store.headers, row._row, { Revoked: 'TRUE' });
    }
  });
}

/**
 * Resolve the caller. Returns { user, session } where user is the *current*
 * Users-sheet record, so deactivating an account takes effect immediately.
 */
function requireSession_(token) {
  if (!token) throw appError_(ERR.UNAUTHORIZED, 'Sign in to continue.');
  var hash = sha256Hex_(String(token));
  var store = readTable_('SESSIONS', CONFIG.SHEETS.SESSIONS);
  var match = null;
  for (var i = 0; i < store.rows.length; i += 1) {
    if (String(store.rows[i]['Token hash']) === hash) {
      match = store.rows[i];
      break;
    }
  }
  if (!match) throw appError_(ERR.UNAUTHORIZED, 'Your session has expired. Sign in again.');
  if (String(match.Revoked).toUpperCase() === 'TRUE') {
    throw appError_(ERR.UNAUTHORIZED, 'Your session has ended. Sign in again.');
  }
  if (new Date(match['Expires at']).getTime() < Date.now()) {
    updateRecord_(store.sheet, store.headers, match._row, { Revoked: 'TRUE' });
    throw appError_(ERR.UNAUTHORIZED, 'Your session has expired. Sign in again.');
  }

  var users = readTable_('USERS', CONFIG.SHEETS.USERS).rows;
  var user = findById_(users, 'User ID', match['User ID']);
  if (!user) throw appError_(ERR.UNAUTHORIZED, 'This account no longer exists.');
  if (String(user['Account status']).toUpperCase() !== STATUS.ACTIVE) {
    throw appError_(ERR.FORBIDDEN, 'This account is deactivated. Contact the library administrator.');
  }
  updateRecord_(store.sheet, store.headers, match._row, { 'Last seen': new Date().toISOString() });
  return { user: user, session: match, token: token };
}

function requireRole_(auth, allowed) {
  var role = normaliseRole_(auth.user.Role);
  if (allowed.indexOf(role) === -1) {
    throw appError_(ERR.FORBIDDEN, 'Your role does not allow this action.');
  }
  return role;
}

function normaliseRole_(value) {
  var role = String(value || '').toUpperCase().trim();
  if (role === 'LIBRARIAN' || role === 'STAFF' || role === 'DESK') return ROLES.LIBRARIAN;
  if (role === 'TEACHER') return ROLES.FACULTY;
  if (role === 'ADMINISTRATOR' || role === 'SUPERADMIN') return ROLES.ADMIN;
  return ROLE_LIST.indexOf(role) === -1 ? ROLES.STUDENT : role;
}

/** Anyone who works the desk: sees the whole library, not just their own records. */
function isStaff_(role) {
  return role === ROLES.ADMIN || role === ROLES.LIBRARIAN;
}

/** Public projection of a user — never includes hash, salt or iterations. */
function publicUser_(user) {
  return {
    userId: String(user['User ID']),
    name: String(user.Name),
    email: String(user.Email).toLowerCase(),
    institutionalId: String(user['Institutional ID'] || ''),
    role: normaliseRole_(user.Role),
    department: String(user.Department || ''),
    accountStatus: String(user['Account status'] || STATUS.ACTIVE).toUpperCase(),
    phone: String(user.Phone || ''),
    borrowingLimit: user['Borrowing limit'] === '' ? null : Number(user['Borrowing limit']),
    createdAt: String(user['Created at'] || ''),
    updatedAt: String(user['Updated at'] || ''),
  };
}

/* --------------------------------------------------------------------- login */

function authLogin_(payload) {
  var identifier = sanitizeText_(payload.identifier, 200).toLowerCase();
  var password = String(payload.password || '');
  if (!identifier || !password) {
    throw appError_(ERR.VALIDATION, 'Enter your email or institutional ID and your password.');
  }
  if (isLoginThrottled_(identifier)) {
    throw appError_(ERR.RATE_LIMITED, 'Too many attempts. Wait a few minutes and try again.');
  }

  var users = readTable_('USERS', CONFIG.SHEETS.USERS).rows;
  var user = null;
  for (var i = 0; i < users.length; i += 1) {
    var email = String(users[i].Email || '').toLowerCase();
    var institutional = String(users[i]['Institutional ID'] || '').toLowerCase();
    if (email === identifier || (institutional && institutional === identifier)) {
      user = users[i];
      break;
    }
  }

  var store = readTable_('USERS', CONFIG.SHEETS.USERS);
  if (!user) {
    recordLoginAttempt_(identifier, false);
    throw appError_(ERR.UNAUTHORIZED, 'Email/ID or password is incorrect.');
  }
  if (String(user['Account status']).toUpperCase() !== STATUS.ACTIVE) {
    throw appError_(ERR.FORBIDDEN, 'This account is deactivated. Contact the library administrator.');
  }

  var iterations = Number(user['Hash iterations']) || CONFIG.HASH_ITERATIONS;
  var computed = hashPassword_(password, String(user['Password salt']), iterations);
  if (computed !== String(user['Password hash'])) {
    recordLoginAttempt_(identifier, false);
    throw appError_(ERR.UNAUTHORIZED, 'Email/ID or password is incorrect.');
  }

  var session = createSession_(String(user['User ID']), Boolean(payload.remember));
  recordLoginAttempt_(identifier, true);

  var patch = { 'Updated at': new Date().toISOString() };
  if (iterations !== CONFIG.HASH_ITERATIONS) {
    // Stored with an older work factor — re-hash now that we have the plaintext, so the
    // next sign-in is as fast as the policy intends.
    var newSalt = newSalt_();
    patch['Password salt'] = newSalt;
    patch['Password hash'] = hashPassword_(password, newSalt, CONFIG.HASH_ITERATIONS);
    patch['Hash iterations'] = CONFIG.HASH_ITERATIONS;
  }
  updateRecord_(store.sheet, store.headers, user._row, patch);
  logActivity_(String(user['User ID']), 'auth.login', 'user', String(user['User ID']), 'Signed in');
  return { token: session.token, expiresAt: session.expiresAt, user: publicUser_(user) };
}

/* --------------------------------------------------- throttling (best effort) */

function throttleStore_() {
  return PropertiesService.getScriptProperties();
}

function isLoginThrottled_(identifier) {
  try {
    var raw = throttleStore_().getProperty('login.' + sha256Hex_(identifier));
    if (!raw) return false;
    var record = JSON.parse(raw);
    if (Date.now() - record.first > CONFIG.LOGIN_WINDOW_MINUTES * 60000) return false;
    return record.count >= CONFIG.LOGIN_MAX_ATTEMPTS;
  } catch (err) {
    return false;
  }
}

function recordLoginAttempt_(identifier, success) {
  try {
    var key = 'login.' + sha256Hex_(identifier);
    if (success) {
      throttleStore_().deleteProperty(key);
      return;
    }
    var raw = throttleStore_().getProperty(key);
    var record = raw ? JSON.parse(raw) : { first: Date.now(), count: 0 };
    if (Date.now() - record.first > CONFIG.LOGIN_WINDOW_MINUTES * 60000) {
      record = { first: Date.now(), count: 0 };
    }
    record.count += 1;
    throttleStore_().setProperty(key, JSON.stringify(record));
  } catch (err) {
    // Throttling is best-effort; never block a login because of it.
  }
}

function authLogout_(auth) {
  revokeSession_(auth.token);
  logActivity_(String(auth.user['User ID']), 'auth.logout', 'user', String(auth.user['User ID']), 'Signed out');
  return { loggedOut: true };
}

function authChangePassword_(auth, payload) {
  var current = String(payload.currentPassword || '');
  var next = requirePassword_(payload.newPassword);
  var user = auth.user;
  var iterations = Number(user['Hash iterations']) || CONFIG.HASH_ITERATIONS;
  if (hashPassword_(current, String(user['Password salt']), iterations) !== String(user['Password hash'])) {
    throw appError_(ERR.UNAUTHORIZED, 'Your current password is incorrect.');
  }
  var salt = newSalt_();
  var store = readTable_('USERS', CONFIG.SHEETS.USERS);
  updateRecord_(store.sheet, store.headers, user._row, {
    'Password salt': salt,
    'Password hash': hashPassword_(next, salt, CONFIG.HASH_ITERATIONS),
    'Hash iterations': CONFIG.HASH_ITERATIONS,
    'Updated at': new Date().toISOString(),
  });
  // A changed password must end every *other* session — otherwise a stolen token keeps
  // working because the hash changed underneath it. The caller keeps their own session.
  var revoked = revokeOtherSessions_(String(user['User ID']), String(auth.token || ''));
  logActivity_(
    String(user['User ID']),
    'user.password',
    'user',
    String(user['User ID']),
    'Changed own password' + (revoked ? ' (signed out ' + revoked + ' other session(s))' : ''),
  );
  return { changed: true, sessionsRevoked: revoked };
}

function findById_(rows, header, id) {
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i][header]) === String(id)) return rows[i];
  }
  return null;
}
