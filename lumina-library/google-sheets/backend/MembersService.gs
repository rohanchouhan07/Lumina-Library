/**
 * MembersService.gs — user/member administration (ADMIN only, except self-profile).
 * Roles: ADMIN, FACULTY, STUDENT. Only an ADMIN can create ADMIN accounts.
 */
function mapUser_(user, loans, reservations) {
  var publicData = publicUser_(user);
  var id = publicData.userId;
  var active = (loans || []).filter(function (loan) {
    return String(loan['User ID']) === id && String(loan['Loan status']).toUpperCase() === 'ACTIVE';
  });
  var holds = (reservations || []).filter(function (reservation) {
    var status = String(reservation['Reservation status'] || '').toUpperCase();
    return String(reservation['User ID']) === id && (status === 'PENDING' || status === 'READY');
  });
  publicData.activeLoans = active.length;
  publicData.activeHolds = holds.length;
  publicData.outstandingFine = (loans || []).reduce(function (sum, loan) {
    if (String(loan['User ID']) !== id) return sum;
    var status = String(loan['Loan status']).toUpperCase();
    var fine = Number(loan['Fine amount']) || 0;
    if (status === 'ACTIVE') {
      var days = overdueDays_(loan['Due date']);
      return sum + days * finePerDay_();
    }
    return sum + (status === 'RETURNED' ? fine : 0);
  }, 0);
  return publicData;
}

function listUsers_(auth, params) {
  requireRole_(auth, [ROLES.ADMIN, ROLES.LIBRARIAN]);
  var store = readTable_('USERS', CONFIG.SHEETS.USERS);
  var loans = readTable_('LOANS', CONFIG.SHEETS.LOANS).rows;
  var reservations = readTable_('RESERVATIONS', CONFIG.SHEETS.RESERVATIONS).rows;
  var role = params && params.role ? String(params.role).toUpperCase() : '';
  var users = store.rows
    .filter(function (row) {
      return Boolean(row['User ID']);
    })
    .map(function (row) {
      return mapUser_(row, loans, reservations);
    })
    .filter(function (user) {
      return !role || user.role === role;
    });
  return { users: users, total: users.length };
}

function validateUserPayload_(payload, isCreate, actorRole) {
  var fields = {
    Name: requireString_(payload.name, 'Name', 2, 120),
    Email: requireEmail_(payload.email),
    'Institutional ID': requireString_(payload.institutionalId, 'Institutional ID', 2, 40),
    Role: requireEnum_(payload.role, 'Role', ROLE_LIST),
    Department: optionalString_(payload.department, 120),
    Phone: optionalString_(payload.phone, 30),
  };
  if (fields.Role === ROLES.ADMIN && actorRole !== ROLES.ADMIN) {
    throw appError_(ERR.FORBIDDEN, 'Only an administrator can create or promote administrator accounts.');
  }
  if (actorRole !== ROLES.ADMIN && ASSIGNABLE_BY_LIBRARIAN.indexOf(fields.Role) === -1) {
    throw appError_(ERR.FORBIDDEN, 'Only an administrator can assign that role.');
  }
  if (payload.borrowingLimit !== undefined && payload.borrowingLimit !== '' && payload.borrowingLimit !== null) {
    fields['Borrowing limit'] = requireInt_(payload.borrowingLimit, 'Borrowing limit', 0, 50);
  } else {
    fields['Borrowing limit'] = '';
  }
  if (isCreate) {
    fields['Account status'] = payload.accountStatus
      ? requireEnum_(payload.accountStatus, 'Account status', ['ACTIVE', 'INACTIVE'])
      : STATUS.ACTIVE;
  } else if (payload.accountStatus) {
    fields['Account status'] = requireEnum_(payload.accountStatus, 'Account status', ['ACTIVE', 'INACTIVE']);
  }
  return fields;
}

/**
 * A librarian runs the desk, but cannot act on an administrator account — otherwise the
 * desk role would be a path to taking over the library.
 */
function assertCanManageTarget_(actorRole, targetRow, verb) {
  if (actorRole === ROLES.ADMIN) return;
  if (normaliseRole_(targetRow.Role) === ROLES.ADMIN) {
    throw appError_(ERR.FORBIDDEN, 'Only an administrator can ' + verb + ' an administrator account.');
  }
}

function assertUniqueUser_(rows, fields, ignoreId) {
  var email = fields.Email.toLowerCase();
  var institutional = fields['Institutional ID'].toLowerCase();
  for (var i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    if (ignoreId && String(row['User ID']) === String(ignoreId)) continue;
    if (String(row.Email || '').toLowerCase() === email) {
      throw appError_(ERR.CONFLICT, 'That email is already registered.');
    }
    if (String(row['Institutional ID'] || '').toLowerCase() === institutional) {
      throw appError_(ERR.CONFLICT, 'That institutional ID is already registered.');
    }
  }
}

function createUser_(auth, payload) {
  var actorRole = requireRole_(auth, [ROLES.ADMIN, ROLES.LIBRARIAN]);
  return withLock_(function () {
    var store = readTable_('USERS', CONFIG.SHEETS.USERS);
    var fields = validateUserPayload_(payload, true, actorRole);
    assertUniqueUser_(store.rows, fields, null);
    var password = requirePassword_(payload.password);
    var salt = newSalt_();
    var now = new Date().toISOString();
    var record = {};
    Object.keys(fields).forEach(function (key) {
      record[key] = fields[key];
    });
    record['User ID'] = nextId_('U', store.rows, 'User ID');
    record['Password salt'] = salt;
    record['Password hash'] = hashPassword_(password, salt, CONFIG.HASH_ITERATIONS);
    record['Hash iterations'] = CONFIG.HASH_ITERATIONS;
    record['Created at'] = now;
    record['Updated at'] = now;
    appendRecord_(store.sheet, store.headers, record);
    logActivity_(
      String(auth.user['User ID']),
      'user.created',
      'user',
      record['User ID'],
      'Created ' + record.Role + ' account for ' + record.Name,
    );
    return { user: publicUser_(record) };
  });
}

function updateUser_(auth, payload) {
  var actorRole = requireRole_(auth, [ROLES.ADMIN, ROLES.LIBRARIAN]);
  return withLock_(function () {
    var userId = requireId_(payload.userId, 'User ID');
    var store = readTable_('USERS', CONFIG.SHEETS.USERS);
    var row = findById_(store.rows, 'User ID', userId);
    if (!row) throw appError_(ERR.NOT_FOUND, 'That account does not exist.');
    assertCanManageTarget_(actorRole, row, 'edit');
    var fields = validateUserPayload_(payload, false, actorRole);
    assertUniqueUser_(store.rows, fields, userId);
    fields['Updated at'] = new Date().toISOString();
    if (payload.password) {
      var salt = newSalt_();
      fields['Password salt'] = salt;
      fields['Password hash'] = hashPassword_(requirePassword_(payload.password), salt, CONFIG.HASH_ITERATIONS);
      fields['Hash iterations'] = CONFIG.HASH_ITERATIONS;
    }
    updateRecord_(store.sheet, store.headers, row._row, fields);
    logActivity_(
      String(auth.user['User ID']),
      'user.updated',
      'user',
      userId,
      'Updated account for ' + fields.Name,
    );
    return { user: publicUser_(Object.assign({}, row, fields)) };
  });
}

function setUserStatus_(auth, payload) {
  var actorRole = requireRole_(auth, [ROLES.ADMIN, ROLES.LIBRARIAN]);
  return withLock_(function () {
    var userId = requireId_(payload.userId, 'User ID');
    var status = requireEnum_(payload.accountStatus, 'Account status', ['ACTIVE', 'INACTIVE']);
    if (String(auth.user['User ID']) === userId && status === STATUS.INACTIVE) {
      throw appError_(ERR.CONFLICT, 'You cannot deactivate your own account.');
    }
    var store = readTable_('USERS', CONFIG.SHEETS.USERS);
    var row = findById_(store.rows, 'User ID', userId);
    if (!row) throw appError_(ERR.NOT_FOUND, 'That account does not exist.');
    assertCanManageTarget_(actorRole, row, 'deactivate');
    updateRecord_(store.sheet, store.headers, row._row, {
      'Account status': status,
      'Updated at': new Date().toISOString(),
    });
    if (status === STATUS.INACTIVE) {
      // Invalidate every live session for the deactivated account.
      var sessions = readTable_('SESSIONS', CONFIG.SHEETS.SESSIONS);
      sessions.rows.forEach(function (sessionRow) {
        if (String(sessionRow['User ID']) === userId) {
          updateRecord_(sessions.sheet, sessions.headers, sessionRow._row, { Revoked: 'TRUE' });
        }
      });
    }
    logActivity_(
      String(auth.user['User ID']),
      'user.status',
      'user',
      userId,
      (status === STATUS.ACTIVE ? 'Activated ' : 'Deactivated ') + String(row.Name),
    );
    return { user: publicUser_(Object.assign({}, row, { 'Account status': status })) };
  });
}

/** Self-service profile edit: name, phone and department only. */
function updateOwnProfile_(auth, payload) {
  return withLock_(function () {
    var store = readTable_('USERS', CONFIG.SHEETS.USERS);
    var row = auth.user;
    var fields = {
      Name: requireString_(payload.name, 'Name', 2, 120),
      Phone: optionalString_(payload.phone, 30),
      Department: optionalString_(payload.department, 120),
      'Updated at': new Date().toISOString(),
    };
    updateRecord_(store.sheet, store.headers, row._row, fields);
    logActivity_(String(row['User ID']), 'user.profile', 'user', String(row['User ID']), 'Updated own profile');
    return { user: publicUser_(Object.assign({}, row, fields)) };
  });
}

/** ADMIN recovery: set a temporary password for a user (never returns the hash). */
function resetUserPassword_(auth, payload) {
  var actorRole = requireRole_(auth, [ROLES.ADMIN, ROLES.LIBRARIAN]);
  return withLock_(function () {
    var userId = requireId_(payload.userId, 'User ID');
    var store = readTable_('USERS', CONFIG.SHEETS.USERS);
    var row = findById_(store.rows, 'User ID', userId);
    if (!row) throw appError_(ERR.NOT_FOUND, 'That account does not exist.');
    assertCanManageTarget_(actorRole, row, 'reset the password of');
    var password = requirePassword_(payload.newPassword);
    var salt = newSalt_();
    updateRecord_(store.sheet, store.headers, row._row, {
      'Password salt': salt,
      'Password hash': hashPassword_(password, salt, CONFIG.HASH_ITERATIONS),
      'Hash iterations': CONFIG.HASH_ITERATIONS,
      'Updated at': new Date().toISOString(),
    });
    logActivity_(
      String(auth.user['User ID']),
      'user.password_reset',
      'user',
      userId,
      'Reset password for ' + String(row.Name),
    );
    return { reset: true };
  });
}
