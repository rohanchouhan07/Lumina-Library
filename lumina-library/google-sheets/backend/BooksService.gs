/**
 * BooksService.gs — catalogue reads and writes.
 * Availability is always derived from active loans; the sheet's derived columns
 * are refreshed after every mutation so the spreadsheet never drifts.
 */
function loansForBook_(loans, bookId) {
  return loans.filter(function (loan) {
    var status = String(loan['Loan status'] || '').toUpperCase();
    return String(loan['Book ID']) === bookId && status === 'ACTIVE';
  });
}

function bookAvailability_(book, loans) {
  var total = Math.max(1, Number(book['Total copies']) || 1);
  var onLoan = loansForBook_(loans, String(book['Book ID'])).length;
  return { total: total, onLoan: onLoan, available: Math.max(0, total - onLoan) };
}

function mapBook_(book, loans) {
  var availability = bookAvailability_(book, loans);
  var isbn = String(book.ISBN || '');
  return {
    bookId: String(book['Book ID']),
    title: String(book.Title || ''),
    author: String(book.Author || ''),
    isbn: isbn,
    publisher: String(book.Publisher || ''),
    year: Number(book.Year) || 0,
    category: String(book.Category || 'General'),
    description: String(book.Description || ''),
    coverImageUrl: String(book['Cover image URL'] || ''),
    shelfLocation: String(book.Shelf || ''),
    totalCopies: availability.total,
    availableCopies: availability.available,
    copiesOnLoan: availability.onLoan,
    recordStatus: String(book.Status || 'ACTIVE').toUpperCase() === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    createdAt: String(book['Created at'] || book.Added || ''),
    updatedAt: String(book['Updated at'] || ''),
  };
}

function listBooks_(params) {
  var store = readTable_('BOOKS', CONFIG.SHEETS.BOOKS);
  var loans = readTable_('LOANS', CONFIG.SHEETS.LOANS).rows;
  var books = store.rows
    .map(function (book) {
      return mapBook_(book, loans);
    })
    .filter(function (book) {
      return Boolean(book.bookId) && Boolean(book.title);
    });
  return { books: books, total: books.length };
}

/**
 * Public, unauthenticated catalogue read — the one action that answers without a session.
 *
 * It exists because the marketing site and /catalog are public pages: before this, a signed-out
 * visitor saw an empty catalogue and four zeroes, which looked broken.
 *
 * What it deliberately does NOT return: member names, emails, IDs, loans, reservations, fines,
 * activity, settings. Only title-level fields that are printed on a book's spine anyway, plus
 * three aggregate counters. Archived titles are hidden.
 */
function publicCatalogue_(params) {
  var payload = params || {};
  var books = listBooks_({}).books.filter(function (book) {
    return book.recordStatus === 'ACTIVE';
  });

  var search = payload.search ? sanitizeText_(payload.search, 80).toLowerCase() : '';
  if (search) {
    books = books.filter(function (book) {
      var haystack = [book.title, book.author, book.category, book.isbn].join(' ').toLowerCase();
      return haystack.indexOf(search) !== -1;
    });
  }

  var category = payload.category ? sanitizeText_(payload.category, 80).toLowerCase() : '';
  if (category && category !== 'all') {
    books = books.filter(function (book) {
      return String(book.category).toLowerCase() === category;
    });
  }

  var all = listBooks_({}).books.filter(function (book) {
    return book.recordStatus === 'ACTIVE';
  });
  var copies = 0;
  var available = 0;
  var onLoan = 0;
  (all || []).forEach(function (book) {
    copies += Number(book.totalCopies) || 0;
    available += Number(book.availableCopies) || 0;
    onLoan += Number(book.copiesOnLoan) || 0;
  });

  var users = readTable_('USERS', CONFIG.SHEETS.USERS).rows.filter(function (row) {
    return String(row['Account status'] || '').toUpperCase() !== 'INACTIVE';
  });

  return {
    books: books,
    total: books.length,
    stats: {
      titles: all.length,
      copies: copies,
      available: available,
      onLoan: onLoan,
      members: users.length,
    },
    serverTime: new Date().toISOString(),
  };
}

function getBook_(params) {
  var bookId = requireId_(params.bookId, 'Book ID');
  var store = readTable_('BOOKS', CONFIG.SHEETS.BOOKS);
  var loans = readTable_('LOANS', CONFIG.SHEETS.LOANS).rows;
  var row = findById_(store.rows, 'Book ID', bookId);
  if (!row) throw appError_(ERR.NOT_FOUND, 'That book does not exist.');
  return { book: mapBook_(row, loans) };
}

function validateBookPayload_(payload) {
  return {
    Title: requireString_(payload.title, 'Title', 1, 300),
    Author: requireString_(payload.author, 'Author', 1, 200),
    ISBN: optionalString_(payload.isbn, 40),
    Publisher: optionalString_(payload.publisher, 160),
    Year: payload.year === '' || payload.year === undefined ? '' : requireInt_(payload.year, 'Year', 1400, 2100),
    Category: optionalString_(payload.category, 80) || 'General',
    Shelf: optionalString_(payload.shelf, 40),
    'Total copies': requireInt_(payload.totalCopies, 'Total copies', 1, 999),
    Description: optionalString_(payload.description, 2000),
    'Cover image URL': optionalString_(payload.coverImageUrl, 500),
  };
}

function createBook_(auth, payload) {
  requireRole_(auth, [ROLES.ADMIN, ROLES.LIBRARIAN]);
  return withLock_(function () {
    var store = readTable_('BOOKS', CONFIG.SHEETS.BOOKS);
    var fields = validateBookPayload_(payload);
    var duplicate = store.rows.some(function (row) {
      var sameTitle = String(row.Title || '').toLowerCase() === fields.Title.toLowerCase();
      var sameIsbn = fields.ISBN && String(row.ISBN || '') === fields.ISBN;
      return sameTitle || sameIsbn;
    });
    if (duplicate) {
      throw appError_(ERR.CONFLICT, 'A book with that title or ISBN already exists.');
    }
    var now = new Date().toISOString();
    var record = {};
    Object.keys(fields).forEach(function (key) {
      record[key] = fields[key];
    });
    record['Book ID'] = nextId_('BK', store.rows, 'Book ID');
    record.Status = 'ACTIVE';
    record.Added = now;
    record['Created at'] = now;
    record['Updated at'] = now;
    record['Copies on loan'] = 0;
    record['Available copies'] = fields['Total copies'];
    appendRecord_(store.sheet, store.headers, record);
    logActivity_(
      String(auth.user['User ID']),
      'book.created',
      'book',
      record['Book ID'],
      'Added "' + fields.Title + '" (' + fields['Total copies'] + ' copies)',
    );
    return { book: mapBook_(record, []) };
  });
}

function updateBook_(auth, payload) {
  requireRole_(auth, [ROLES.ADMIN, ROLES.LIBRARIAN]);
  return withLock_(function () {
    var bookId = requireId_(payload.bookId, 'Book ID');
    var store = readTable_('BOOKS', CONFIG.SHEETS.BOOKS);
    var row = findById_(store.rows, 'Book ID', bookId);
    if (!row) throw appError_(ERR.NOT_FOUND, 'That book does not exist.');
    var fields = validateBookPayload_(payload);
    var loans = readTable_('LOANS', CONFIG.SHEETS.LOANS).rows;
    var active = loansForBook_(loans, bookId).length;
    if (fields['Total copies'] < active) {
      throw appError_(
        ERR.CONFLICT,
        'Total copies cannot be below the ' + active + ' copies currently on loan. Process returns first.',
      );
    }
    fields['Updated at'] = new Date().toISOString();
    updateRecord_(store.sheet, store.headers, row._row, fields);
    refreshBookDerived_(store, loans);
    logActivity_(String(auth.user['User ID']), 'book.updated', 'book', bookId, 'Updated "' + fields.Title + '"');
    return { book: mapBook_(Object.assign({}, row, fields), loans) };
  });
}

function archiveBook_(auth, payload) {
  requireRole_(auth, [ROLES.ADMIN, ROLES.LIBRARIAN]);
  return withLock_(function () {
    var bookId = requireId_(payload.bookId, 'Book ID');
    var archived = payload.archived !== false;
    var store = readTable_('BOOKS', CONFIG.SHEETS.BOOKS);
    var row = findById_(store.rows, 'Book ID', bookId);
    if (!row) throw appError_(ERR.NOT_FOUND, 'That book does not exist.');
    updateRecord_(store.sheet, store.headers, row._row, {
      Status: archived ? 'ARCHIVED' : 'ACTIVE',
      'Updated at': new Date().toISOString(),
    });
    logActivity_(
      String(auth.user['User ID']),
      archived ? 'book.archived' : 'book.restored',
      'book',
      bookId,
      (archived ? 'Archived "' : 'Restored "') + String(row.Title) + '"',
    );
    return { book: mapBook_(Object.assign({}, row, { Status: archived ? 'ARCHIVED' : 'ACTIVE' }), []) };
  });
}

/** Recompute the derived columns for every book so the sheet never drifts. */
function refreshBookDerived_(store, loans) {
  var rows = store.rows;
  if (!rows.length) return;
  var headerRow = columnMap_(store.headers);
  writeColumn_(store.sheet, rows, 'Copies on loan', headerRow, function (row) {
    return bookAvailability_(row, loans).onLoan;
  });
  writeColumn_(store.sheet, rows, 'Available copies', headerRow, function (row) {
    return bookAvailability_(row, loans).available;
  });
}

/**
 * Permanently delete a catalogue row — only when it has no circulation history.
 * Titles that were ever borrowed or reserved must be archived instead so the
 * Loans/Reservations tabs never point at a missing book.
 */
function deleteBook_(auth, payload) {
  requireRole_(auth, [ROLES.ADMIN]);
  return withLock_(function () {
    var bookId = requireId_(payload.bookId, 'Book ID');
    var store = readTable_('BOOKS', CONFIG.SHEETS.BOOKS);
    var row = findById_(store.rows, 'Book ID', bookId);
    if (!row) throw appError_(ERR.NOT_FOUND, 'That book does not exist.');

    var loans = readTable_('LOANS', CONFIG.SHEETS.LOANS).rows.filter(function (loan) {
      return String(loan['Book ID']) === bookId;
    });
    if (loans.length) {
      throw appError_(
        ERR.CONFLICT,
        'This title has circulation history (' +
          loans.length +
          ' loan record(s)), so it cannot be deleted. Archive it instead to keep the records consistent.',
      );
    }
    // Only holds that are still open block deletion; cancelled/expired rows are history.
    var openReservations = readTable_('RESERVATIONS', CONFIG.SHEETS.RESERVATIONS).rows.filter(function (reservation) {
      var status = String(reservation['Reservation status'] || '').toUpperCase();
      return String(reservation['Book ID']) === bookId && (status === 'PENDING' || status === 'READY');
    });
    if (openReservations.length) {
      throw appError_(
        ERR.CONFLICT,
        'This title still has ' + openReservations.length + ' open reservation(s). Cancel them before deleting.',
      );
    }

    deleteRow_(store.sheet, row._row);
    logActivity_(
      String(auth.user['User ID']),
      'book.deleted',
      'book',
      bookId,
      'Deleted "' + String(row.Title) + '" (no circulation history)',
    );
    return { deleted: true, bookId: bookId };
  });
}
