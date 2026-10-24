/** ReportsService.gs — dashboard statistics and date-ranged analytics. */
function dashboardStats_(auth) {
  var role = normaliseRole_(auth.user.Role);
  var context = loanContext_();
  var reservations = readTable_('RESERVATIONS', CONFIG.SHEETS.RESERVATIONS).rows;

  var mine = {
    activeLoans: activeLoansForUser_(context.loans, String(auth.user['User ID'])),
    holds: reservations.filter(function (row) {
      var status = String(row['Reservation status'] || '').toUpperCase();
      return String(row['User ID']) === String(auth.user['User ID']) && (status === 'PENDING' || status === 'READY');
    }),
  };

  var books = context.books.filter(function (book) {
    return String(book.Title || '').trim() !== '' && String(book['Book ID'] || '').trim() !== '';
  });
  var totalCopies = books.reduce(function (sum, book) {
    return sum + Math.max(1, Number(book['Total copies']) || 1);
  }, 0);
  var onLoan = context.loans.filter(function (loan) {
    return String(loan['Loan status']).toUpperCase() === 'ACTIVE';
  }).length;
  var users = context.users.filter(function (user) {
    return String(user['User ID'] || '').trim() !== '';
  });

  var stats = {
    scope: isStaff_(role) ? 'LIBRARY' : 'SELF',
    totals: {
      titles: books.length,
      copies: totalCopies,
      availableCopies: Math.max(0, totalCopies - onLoan),
      members: users.length,
      students: users.filter(function (u) { return normaliseRole_(u.Role) === ROLES.STUDENT; }).length,
      faculty: users.filter(function (u) { return normaliseRole_(u.Role) === ROLES.FACULTY; }).length,
      admins: users.filter(function (u) { return normaliseRole_(u.Role) === ROLES.ADMIN; }).length,
      activeLoans: onLoan,
      overdue: context.loans.filter(function (loan) {
        return String(loan['Loan status']).toUpperCase() === 'ACTIVE' && overdueDays_(loan['Due date']) > 0;
      }).length,
      activeHolds: reservations.filter(function (row) {
        var status = String(row['Reservation status'] || '').toUpperCase();
        return status === 'PENDING' || status === 'READY';
      }).length,
      simulatedFines: context.loans.reduce(function (sum, loan) {
        var status = String(loan['Loan status']).toUpperCase();
        if (status === 'ACTIVE') return sum + overdueDays_(loan['Due date']) * finePerDay_();
        return sum + (status === 'RETURNED' ? Number(loan['Fine amount']) || 0 : 0);
      }, 0),
    },
    mine: {
      activeLoans: mine.activeLoans.length,
      overdue: mine.activeLoans.filter(function (loan) { return overdueDays_(loan['Due date']) > 0; }).length,
      holds: mine.holds.length,
      simulatedFines: unpaidFinesForUser_(context.loans, String(auth.user['User ID'])),
      borrowLimit: borrowLimitFor_(auth.user),
    },
  };
  return stats;
}

/**
 * Analytics over an inclusive date range.
 * Non-staff callers only ever see their own circulation, never library totals.
 */
function analytics_(auth, params) {
  var role = normaliseRole_(auth.user.Role);
  var staff = isStaff_(role);
  var from = params && params.from ? parseIsoDate_(params.from, 'From date') : addDays_(new Date(), -180);
  var to = params && params.to ? parseIsoDate_(params.to, 'To date') : new Date();
  if (from > to) throw appError_(ERR.VALIDATION, 'The start date must be before the end date.');

  var context = loanContext_();
  var scoped = context.loans.filter(function (loan) {
    if (!staff && String(loan['User ID']) !== String(auth.user['User ID'])) return false;
    var issued = new Date(loan['Issue date']);
    return !isNaN(issued.getTime()) && issued >= from && issued <= to;
  });
  if (!staff) {
    return {
      scope: 'SELF',
      range: { from: from.toISOString(), to: to.toISOString() },
      issued: scoped.length,
      returned: scoped.filter(function (l) { return String(l['Loan status']).toUpperCase() === 'RETURNED'; }).length,
      series: [],
      categories: [],
      topBooks: [],
    };
  }

  var byMonth = {};
  var byCategory = {};
  scoped.forEach(function (loan) {
    var issued = new Date(loan['Issue date']);
    var key = issued.getUTCFullYear() + '-' + String(issued.getUTCMonth() + 1).padStart(2, '0');
    byMonth[key] = byMonth[key] || { month: key, issued: 0, returned: 0 };
    byMonth[key].issued += 1;
    if (String(loan['Loan status']).toUpperCase() === 'RETURNED') byMonth[key].returned += 1;
    var book = context.booksById[String(loan['Book ID'])];
    var category = (book && book.category) || 'General';
    byCategory[category] = (byCategory[category] || 0) + 1;
  });

  var counts = {};
  scoped.forEach(function (loan) {
    var id = String(loan['Book ID']);
    counts[id] = (counts[id] || 0) + 1;
  });
  var topBooks = Object.keys(counts)
    .map(function (id) {
      var book = context.booksById[id];
      return { bookId: id, title: book ? book.title : id, author: book ? book.author : '', loans: counts[id] };
    })
    .sort(function (a, b) {
      return b.loans - a.loans;
    })
    .slice(0, 8);

  return {
    scope: 'LIBRARY',
    range: { from: from.toISOString(), to: to.toISOString() },
    issued: scoped.length,
    returned: scoped.filter(function (l) { return String(l['Loan status']).toUpperCase() === 'RETURNED'; }).length,
    series: Object.keys(byMonth)
      .sort()
      .map(function (key) {
        return byMonth[key];
      }),
    categories: Object.keys(byCategory)
      .map(function (key) {
        return { category: key, loans: byCategory[key] };
      })
      .sort(function (a, b) {
        return b.loans - a.loans;
      }),
    topBooks: topBooks,
  };
}

function listActivity_(auth, params) {
  var role = normaliseRole_(auth.user.Role);
  var store = readTable_('ACTIVITY', CONFIG.SHEETS.ACTIVITY);
  var limit = Math.min(Math.max(Number((params && params.limit) || 40), 1), 200);
  var rows = store.rows.filter(function (row) {
    if (isStaff_(role)) return true;
    return String(row['Actor user ID']) === String(auth.user['User ID']);
  });
  rows = rows
    .sort(function (a, b) {
      return new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime();
    })
    .slice(0, limit);
  return {
    activity: rows.map(function (row) {
      return {
        activityId: String(row['Activity ID']),
        actorUserId: String(row['Actor user ID'] || ''),
        action: String(row.Action || ''),
        entityType: String(row['Entity type'] || ''),
        entityId: String(row['Entity ID'] || ''),
        timestamp: String(row.Timestamp || ''),
        summary: String(row.Summary || ''),
      };
    }),
  };
}

function logActivity_(actorId, action, entityType, entityId, summary) {
  try {
    var store = readTable_('ACTIVITY', CONFIG.SHEETS.ACTIVITY);
    appendRecord_(store.sheet, store.headers, {
      'Activity ID': nextId_('AC', store.rows, 'Activity ID'),
      'Actor user ID': actorId || 'SYSTEM',
      Action: action,
      'Entity type': entityType,
      'Entity ID': entityId,
      Timestamp: new Date().toISOString(),
      Summary: sanitizeText_(summary, 300),
    });
  } catch (err) {
    // Activity logging must never break the operation it is recording.
    try {
      console.error('Lumina activity log failed: ' + err.message);
    } catch (ignored) {}
  }
}
