/**
 * ReservationsService.gs — holds with queue positions, expiry and duplicate prevention.
 * Status policy: PENDING → READY (a copy released) → FULFILLED | CANCELLED | EXPIRED.
 */
function mapReservation_(reservation, booksById, usersById) {
  var status = String(reservation['Reservation status'] || 'PENDING').toUpperCase();
  return {
    reservationId: String(reservation['Reservation ID']),
    bookId: String(reservation['Book ID']),
    bookTitle: booksById[String(reservation['Book ID'])] || '',
    userId: String(reservation['User ID']),
    userName: usersById[String(reservation['User ID'])] || '',
    reservationDate: String(reservation['Reservation date'] || ''),
    queuePosition: Number(reservation['Queue position']) || 0,
    reservationStatus: status,
    expiryDate: reservation['Expiry date'] ? String(reservation['Expiry date']) : null,
    createdAt: String(reservation['Created at'] || ''),
    updatedAt: String(reservation['Updated at'] || ''),
  };
}

function reservationContext_() {
  var books = readTable_('BOOKS', CONFIG.SHEETS.BOOKS).rows;
  var users = readTable_('USERS', CONFIG.SHEETS.USERS).rows;
  var booksById = {};
  books.forEach(function (book) {
    booksById[String(book['Book ID'])] = String(book.Title || '');
  });
  var usersById = {};
  users.forEach(function (user) {
    usersById[String(user['User ID'])] = String(user.Name || '');
  });
  return { booksById: booksById, usersById: usersById };
}

function listReservations_(auth, params) {
  var role = normaliseRole_(auth.user.Role);
  var context = reservationContext_();
  var store = readTable_('RESERVATIONS', CONFIG.SHEETS.RESERVATIONS);
  var rows = store.rows.filter(function (row) {
    if (isStaff_(role)) return true;
    return String(row['User ID']) === String(auth.user['User ID']);
  });
  var reservations = rows.map(function (row) {
    return mapReservation_(row, context.booksById, context.usersById);
  });
  return { reservations: reservations, total: reservations.length, scope: isStaff_(role) ? 'ALL' : 'SELF' };
}

function createReservation_(auth, payload) {
  var role = normaliseRole_(auth.user.Role);
  var selfId = String(auth.user['User ID']);
  var targetUserId = payload.userId ? requireId_(payload.userId, 'User ID') : selfId;
  if (!isStaff_(role) && targetUserId !== selfId) {
    throw appError_(ERR.FORBIDDEN, 'You can only reserve books for your own account.');
  }
  return withLock_(function () {
    var bookId = requireId_(payload.bookId, 'Book ID');
    var books = readTable_('BOOKS', CONFIG.SHEETS.BOOKS);
    var book = findById_(books.rows, 'Book ID', bookId);
    if (!book) throw appError_(ERR.NOT_FOUND, 'That book does not exist.');
    if (String(book.Status || 'ACTIVE').toUpperCase() === 'ARCHIVED') {
      throw appError_(ERR.CONFLICT, 'That title is archived and cannot be reserved.');
    }
    var users = readTable_('USERS', CONFIG.SHEETS.USERS).rows;
    var user = findById_(users, 'User ID', targetUserId);
    if (!user) throw appError_(ERR.NOT_FOUND, 'That member does not exist.');
    if (String(user['Account status']).toUpperCase() !== STATUS.ACTIVE) {
      throw appError_(ERR.FORBIDDEN, 'This account is deactivated.');
    }

    var store = readTable_('RESERVATIONS', CONFIG.SHEETS.RESERVATIONS);
    var active = store.rows.filter(function (row) {
      var status = String(row['Reservation status'] || '').toUpperCase();
      return String(row['Book ID']) === bookId && (status === 'PENDING' || status === 'READY');
    });
    var duplicate = active.filter(function (row) {
      return String(row['User ID']) === targetUserId;
    }).length;
    if (duplicate > 0) {
      throw appError_(ERR.CONFLICT, 'You already have an active reservation for this title.');
    }

    var loans = readTable_('LOANS', CONFIG.SHEETS.LOANS).rows;
    var mine = loans.filter(function (loan) {
      return String(loan['Book ID']) === bookId && String(loan['User ID']) === targetUserId && String(loan['Loan status']).toUpperCase() === 'ACTIVE';
    }).length;
    if (mine > 0) {
      throw appError_(ERR.CONFLICT, 'You already have this title on loan.');
    }

    var now = new Date();
    var record = {
      'Reservation ID': nextId_('RS', store.rows, 'Reservation ID'),
      'Book ID': bookId,
      'User ID': targetUserId,
      'Reservation date': now.toISOString(),
      'Queue position': active.length + 1,
      'Reservation status': 'PENDING',
      'Expiry date': '',
      'Created at': now.toISOString(),
      'Updated at': now.toISOString(),
    };
    appendRecord_(store.sheet, store.headers, record);
    logActivity_(
      String(auth.user['User ID']),
      'reservation.created',
      'reservation',
      record['Reservation ID'],
      'Reserved "' + String(book.Title) + '" (queue #' + record['Queue position'] + ')',
    );
    // Pass the joined names: the client renders the title straight from this response,
    // so an empty lookup map would show a nameless hold in the UI.
    var booksById = {};
    booksById[bookId] = String(book.Title || '');
    var usersById = {};
    usersById[targetUserId] = String(user.Name || '');
    return { reservation: mapReservation_(record, booksById, usersById) };
  });
}

function cancelReservation_(auth, payload) {
  var role = normaliseRole_(auth.user.Role);
  return withLock_(function () {
    var reservationId = requireId_(payload.reservationId, 'Reservation ID');
    var store = readTable_('RESERVATIONS', CONFIG.SHEETS.RESERVATIONS);
    var row = findById_(store.rows, 'Reservation ID', reservationId);
    if (!row) throw appError_(ERR.NOT_FOUND, 'That reservation does not exist.');
    var owner = String(row['User ID']) === String(auth.user['User ID']);
    if (!owner && !isStaff_(role)) {
      throw appError_(ERR.FORBIDDEN, 'You can only cancel your own reservations.');
    }
    var status = String(row['Reservation status'] || '').toUpperCase();
    if (status === 'CANCELLED' || status === 'FULFILLED' || status === 'EXPIRED') {
      throw appError_(ERR.CONFLICT, 'This reservation is already closed.');
    }
    updateRecord_(store.sheet, store.headers, row._row, {
      'Reservation status': 'CANCELLED',
      'Queue position': 0,
      'Updated at': new Date().toISOString(),
    });
    requeue_(String(row['Book ID']));
    logActivity_(String(auth.user['User ID']), 'reservation.cancelled', 'reservation', reservationId, 'Cancelled a reservation');
    var context = reservationContext_();
    return {
      reservation: mapReservation_(Object.assign({}, row, { 'Reservation status': 'CANCELLED' }), context.booksById, context.usersById),
    };
  });
}

/** Recompute queue positions for a title after any change. */
function requeue_(bookId) {
  var store = readTable_('RESERVATIONS', CONFIG.SHEETS.RESERVATIONS);
  var waiting = store.rows
    .filter(function (row) {
      return String(row['Book ID']) === bookId && String(row['Reservation status'] || '').toUpperCase() === 'PENDING';
    })
    .sort(function (a, b) {
      return new Date(a['Reservation date']).getTime() - new Date(b['Reservation date']).getTime();
    });
  waiting.forEach(function (row, index) {
    updateRecord_(store.sheet, store.headers, row._row, { 'Queue position': index + 1 });
  });
}
