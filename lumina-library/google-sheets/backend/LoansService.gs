/**
 * LoansService.gs — issue, return, renew.
 * Circulation runs inside withLock_ and re-reads state, so two concurrent
 * issues can never oversell the last copy, and a loan can never be returned twice.
 */
function mapLoan_(loan, booksById, usersById) {
  var book = booksById[String(loan['Book ID'])] || {};
  var user = usersById[String(loan['User ID'])] || {};
  var status = String(loan['Loan status'] || '').toUpperCase() === 'RETURNED' ? 'RETURNED' : 'ACTIVE';
  var fine = Number(loan['Fine amount']) || 0;
  if (status === 'ACTIVE') fine = overdueDays_(loan['Due date']) * finePerDay_();
  return {
    loanId: String(loan['Loan ID']),
    bookId: String(loan['Book ID']),
    bookTitle: book.title || '',
    userId: String(loan['User ID']),
    userName: user.name || '',
    issuedBy: String(loan['Issued by'] || ''),
    issueDate: String(loan['Issue date'] || ''),
    dueDate: String(loan['Due date'] || ''),
    returnDate: loan['Return date'] ? String(loan['Return date']) : null,
    loanStatus: status,
    renewalCount: Number(loan['Renewal count']) || 0,
    fineAmount: fine,
    overdueDays: status === 'ACTIVE' ? overdueDays_(loan['Due date']) : 0,
    createdAt: String(loan['Created at'] || ''),
    updatedAt: String(loan['Updated at'] || ''),
  };
}

function loanContext_() {
  var books = readTable_('BOOKS', CONFIG.SHEETS.BOOKS).rows;
  var users = readTable_('USERS', CONFIG.SHEETS.USERS).rows;
  var loans = readTable_('LOANS', CONFIG.SHEETS.LOANS).rows;
  var booksById = {};
  books.forEach(function (book) {
    booksById[String(book['Book ID'])] = mapBook_(book, loans);
  });
  var usersById = {};
  users.forEach(function (user) {
    usersById[String(user['User ID'])] = publicUser_(user);
  });
  return { books: books, users: users, loans: loans, booksById: booksById, usersById: usersById };
}

function listLoans_(auth, params) {
  var role = normaliseRole_(auth.user.Role);
  var context = loanContext_();
  var rows = context.loans.filter(function (loan) {
    if (isStaff_(role)) return true;
    return String(loan['User ID']) === String(auth.user['User ID']);
  });
  if (params && params.status && String(params.status).toUpperCase() !== 'ALL') {
    var wanted = String(params.status).toUpperCase();
    rows = rows.filter(function (loan) {
      return String(loan['Loan status'] || '').toUpperCase() === wanted;
    });
  }
  var loans = rows.map(function (loan) {
    return mapLoan_(loan, context.booksById, context.usersById);
  });
  return { loans: loans, total: loans.length, scope: isStaff_(role) ? 'ALL' : 'SELF' };
}

function activeLoansForUser_(loans, userId) {
  return loans.filter(function (loan) {
    return String(loan['User ID']) === userId && String(loan['Loan status']).toUpperCase() === 'ACTIVE';
  });
}

function unpaidFinesForUser_(loans, userId) {
  return loans.reduce(function (sum, loan) {
    if (String(loan['User ID']) !== userId) return sum;
    var status = String(loan['Loan status']).toUpperCase();
    if (status === 'ACTIVE') return sum + overdueDays_(loan['Due date']) * finePerDay_();
    if (status === 'RETURNED') return sum + (Number(loan['Fine amount']) || 0);
    return sum;
  }, 0);
}

/**
 * Issue a copy. ADMIN issues for anyone; FACULTY/STUDENT may self-issue only when
 * the policy setting allows it, and only for themselves.
 */
function issueLoan_(auth, payload) {
  var role = normaliseRole_(auth.user.Role);
  var selfId = String(auth.user['User ID']);
  var targetUserId = payload.userId ? requireId_(payload.userId, 'User ID') : selfId;
  if (!isStaff_(role) && targetUserId !== selfId) {
    throw appError_(ERR.FORBIDDEN, 'You can only borrow books for your own account.');
  }
  if (!isStaff_(role) && String(readSettings_().settings.allow_self_checkout) !== 'true') {
    throw appError_(ERR.FORBIDDEN, 'Self checkout is disabled. Ask library staff to issue this book.');
  }

  return withLock_(function () {
    var context = loanContext_();
    var bookId = requireId_(payload.bookId, 'Book ID');
    var bookRow = findById_(context.books, 'Book ID', bookId);
    if (!bookRow) throw appError_(ERR.NOT_FOUND, 'That book does not exist.');
    var userRow = findById_(context.users, 'User ID', targetUserId);
    if (!userRow) throw appError_(ERR.NOT_FOUND, 'That member does not exist.');
    if (String(userRow['Account status']).toUpperCase() !== STATUS.ACTIVE) {
      throw appError_(ERR.FORBIDDEN, 'This account is deactivated and cannot borrow.');
    }
    if (String(bookRow.Status || 'ACTIVE').toUpperCase() === 'ARCHIVED') {
      throw appError_(ERR.CONFLICT, 'That title is archived and cannot be issued.');
    }

    var availability = bookAvailability_(bookRow, context.loans);
    if (availability.available < 1) {
      throw appError_(ERR.CONFLICT, 'No copies are available. Place a reservation instead.');
    }

    var existing = activeLoansForUser_(context.loans, targetUserId);
    var duplicate = existing.filter(function (loan) {
      return String(loan['Book ID']) === bookId;
    }).length;
    if (duplicate > 0) {
      throw appError_(ERR.CONFLICT, 'This member already has a copy of that title on loan.');
    }
    var limit = borrowLimitFor_(userRow);
    if (existing.length >= limit) {
      throw appError_(ERR.CONFLICT, 'Borrowing limit reached (' + limit + ' books). Return a book first.');
    }

    var settings = readSettings_().settings;
    if (String(settings.block_issue_on_unpaid_fines) === 'true') {
      var fines = unpaidFinesForUser_(context.loans, targetUserId);
      if (fines >= Number(settings.fine_block_threshold || 0)) {
        throw appError_(ERR.CONFLICT, 'Unpaid simulated fines of ₹' + fines + ' block new loans.');
      }
    }

    var store = readTable_('LOANS', CONFIG.SHEETS.LOANS);
    var now = new Date();
    var dueDays = settingNumber_('loan_duration_days') || 14;
    var record = {
      'Loan ID': nextId_('LN', store.rows, 'Loan ID'),
      'Book ID': bookId,
      'User ID': targetUserId,
      'Issued by': isStaff_(role) ? String(auth.user['User ID']) : targetUserId,
      'Issue date': now.toISOString(),
      'Due date': addDays_(now, dueDays).toISOString(),
      'Return date': '',
      'Loan status': 'ACTIVE',
      'Renewal count': 0,
      'Fine amount': '',
      'Created at': now.toISOString(),
      'Updated at': now.toISOString(),
    };
    appendRecord_(store.sheet, store.headers, record);

    var bookStore = readTable_('BOOKS', CONFIG.SHEETS.BOOKS);
    refreshBookDerived_(bookStore, readTable_('LOANS', CONFIG.SHEETS.LOANS).rows);

    logActivity_(
      String(auth.user['User ID']),
      'loan.issued',
      'loan',
      record['Loan ID'],
      'Issued "' + String(bookRow.Title) + '" to ' + String(userRow.Name),
    );
    // Join the title and member name: the UI renders this response immediately, so an
    // empty context would show a loan with no title.
    var booksById = {};
    booksById[bookId] = mapBook_(bookRow, context.loans.concat([record]));
    var usersById = {};
    usersById[targetUserId] = publicUser_(userRow);
    return { loan: mapLoan_(record, booksById, usersById) };
  });
}

function returnLoan_(auth, payload) {
  var role = normaliseRole_(auth.user.Role);
  if (!isStaff_(role)) {
    throw appError_(ERR.FORBIDDEN, 'Only library staff can process returns.');
  }
  return withLock_(function () {
    var loanId = requireId_(payload.loanId, 'Loan ID');
    var store = readTable_('LOANS', CONFIG.SHEETS.LOANS);
    var loan = findById_(store.rows, 'Loan ID', loanId);
    if (!loan) throw appError_(ERR.NOT_FOUND, 'That loan does not exist.');
    if (String(loan['Loan status']).toUpperCase() === 'RETURNED') {
      throw appError_(ERR.CONFLICT, 'This loan was already returned.');
    }
    var now = new Date();
    var daysLate = overdueDays_(loan['Due date']);
    var fine = daysLate * finePerDay_();
    updateRecord_(store.sheet, store.headers, loan._row, {
      'Return date': now.toISOString(),
      'Loan status': 'RETURNED',
      'Fine amount': fine,
      'Updated at': now.toISOString(),
    });
    var bookStore = readTable_('BOOKS', CONFIG.SHEETS.BOOKS);
    refreshBookDerived_(bookStore, readTable_('LOANS', CONFIG.SHEETS.LOANS).rows);
    var book = findById_(bookStore.rows, 'Book ID', String(loan['Book ID']));
    logActivity_(
      String(auth.user['User ID']),
      'loan.returned',
      'loan',
      loanId,
      'Returned "' + String(book ? book.Title : 'title') + '"' + (fine > 0 ? ' with ₹' + fine + ' simulated fine' : ''),
    );
    var context = loanContext_();
    return {
      loan: mapLoan_(
        Object.assign({}, loan, { 'Loan status': 'RETURNED', 'Fine amount': fine }),
        context.booksById,
        context.usersById,
      ),
      fine: fine,
      daysLate: daysLate,
    };
  });
}

function renewLoan_(auth, payload) {
  var role = normaliseRole_(auth.user.Role);
  return withLock_(function () {
    var loanId = requireId_(payload.loanId, 'Loan ID');
    var store = readTable_('LOANS', CONFIG.SHEETS.LOANS);
    var loan = findById_(store.rows, 'Loan ID', loanId);
    if (!loan) throw appError_(ERR.NOT_FOUND, 'That loan does not exist.');
    var owner = String(loan['User ID']) === String(auth.user['User ID']);
    if (!owner && !isStaff_(role)) {
      throw appError_(ERR.FORBIDDEN, 'You can only renew your own loans.');
    }
    if (String(loan['Loan status']).toUpperCase() === 'RETURNED') {
      throw appError_(ERR.CONFLICT, 'A returned loan cannot be renewed.');
    }
    if (overdueDays_(loan['Due date']) > 0) {
      throw appError_(ERR.CONFLICT, 'Overdue loans cannot be renewed. Return the book first.');
    }
    var maxRenewals = settingNumber_('max_renewals');
    var renewals = Number(loan['Renewal count']) || 0;
    if (renewals >= maxRenewals) {
      throw appError_(ERR.CONFLICT, 'Renewal limit reached (' + maxRenewals + ').');
    }
    var extensionDays = settingNumber_('renewal_extension_days') || 14;
    var newDue = addDays_(new Date(loan['Due date']), extensionDays);
    // Do not push the due date past an active reservation held by someone else.
    var reservations = readTable_('RESERVATIONS', CONFIG.SHEETS.RESERVATIONS).rows.filter(function (row) {
      var status = String(row['Reservation status'] || '').toUpperCase();
      return String(row['Book ID']) === String(loan['Book ID']) && (status === 'PENDING' || status === 'READY');
    });
    if (reservations.length > 0) {
      throw appError_(ERR.CONFLICT, 'Another member is waiting for this title, so it cannot be renewed.');
    }
    updateRecord_(store.sheet, store.headers, loan._row, {
      'Due date': newDue.toISOString(),
      'Renewal count': renewals + 1,
      'Updated at': new Date().toISOString(),
    });
    logActivity_(String(auth.user['User ID']), 'loan.renewed', 'loan', loanId, 'Renewed a loan until ' + newDue.toISOString().slice(0, 10));
    var context = loanContext_();
    return {
      loan: mapLoan_(
        Object.assign({}, loan, { 'Due date': newDue.toISOString(), 'Renewal count': renewals + 1 }),
        context.booksById,
        context.usersById,
      ),
    };
  });
}
