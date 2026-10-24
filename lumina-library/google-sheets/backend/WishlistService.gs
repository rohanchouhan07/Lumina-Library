/** WishlistService.gs — a member's personal saved titles (self-service only). */
function listWishlist_(auth) {
  var store = readTable_('WISHLISTS', CONFIG.SHEETS.WISHLISTS);
  var rows = store.rows.filter(function (row) {
    return String(row['User ID']) === String(auth.user['User ID']);
  });
  return {
    wishlist: rows.map(function (row) {
      return { bookId: String(row['Book ID']), createdAt: String(row['Created at'] || '') };
    }),
  };
}

function toggleWishlist_(auth, payload) {
  var bookId = requireId_(payload.bookId, 'Book ID');
  var userId = String(auth.user['User ID']);
  return withLock_(function () {
    var books = readTable_('BOOKS', CONFIG.SHEETS.BOOKS);
    if (!findById_(books.rows, 'Book ID', bookId)) throw appError_(ERR.NOT_FOUND, 'That book does not exist.');
    var store = readTable_('WISHLISTS', CONFIG.SHEETS.WISHLISTS);
    var existing = store.rows.filter(function (row) {
      return String(row['User ID']) === userId && String(row['Book ID']) === bookId;
    })[0];
    if (existing) {
      store.sheet.deleteRow(existing._row);
      return { bookId: bookId, saved: false };
    }
    appendRecord_(store.sheet, store.headers, {
      'User ID': userId,
      'Book ID': bookId,
      'Created at': new Date().toISOString(),
    });
    return { bookId: bookId, saved: true };
  });
}
