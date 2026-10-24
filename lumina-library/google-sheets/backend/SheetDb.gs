/**
 * SheetDb.gs — the only place that touches SpreadsheetApp.
 *
 * Design rules:
 *  • Never delete, rename or reorder an existing tab or column.
 *  • Only ever append: missing tabs get created, missing headers get appended to
 *    the right of the existing header row, records get appended as new rows.
 *  • Column positions are always read from the sheet's own header row, so a
 *    legacy layout with extra/reordered columns still round-trips correctly.
 *  • Tabs are resolved by name first, then by header signature (see SHEET_MATCH
 *    in Config.gs) so a workbook with different tab names keeps its data.
 */

/** Normalise a header for comparison: lower-case alphanumerics only. */
function headerKey_(header) {
  return String(header)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Read the header row of a tab, trimmed, as strings. Never throws on an empty tab. */
function readHeaderRow_(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return [];
  return sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(function (header) {
      return String(header).trim();
    });
}

/**
 * Find the tab that holds a logical table:
 *   1. exact tab-name match,
 *   2. a tab whose header row carries every key header and none of the
 *      conflicting ones (SHEET_MATCH),
 *   3. null — the caller decides whether to create it.
 */
function findSheet_(kind, sheetName) {
  var book = spreadsheet_();
  var byName = book.getSheetByName(sheetName);
  if (byName) return byName;

  var match = SHEET_MATCH[kind];
  if (!match) return null;
  var keys = match.KEYS.map(headerKey_);
  var blocked = (match.NOT || []).map(headerKey_);

  var sheets = book.getSheets();
  for (var i = 0; i < sheets.length; i += 1) {
    var sheet = sheets[i];
    if (sheet.getLastColumn() < 1) continue;
    var headers = readHeaderRow_(sheet).map(headerKey_);
    var hasAllKeys = keys.every(function (key) {
      return headers.indexOf(key) !== -1;
    });
    if (!hasAllKeys) continue;
    var hasBlocked = blocked.some(function (key) {
      return headers.indexOf(key) !== -1;
    });
    if (hasBlocked) continue;
    return sheet;
  }
  return null;
}

/** Get a tab, creating it with canonical headers only when it does not exist. */
function ensureSheet_(kind, sheetName) {
  var sheet = findSheet_(kind, sheetName);
  if (sheet) {
    ensureHeaders_(sheet, CONFIG.HEADERS[kind]);
    return sheet;
  }
  var book = spreadsheet_();
  sheet = book.insertSheet(sheetName);
  var headers = CONFIG.HEADERS[kind];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  return sheet;
}

/** Append any missing headers to the right of the existing ones; existing columns stay put. */
function ensureHeaders_(sheet, headers) {
  var existing = readHeaderRow_(sheet);
  var existingKeys = existing.map(headerKey_);
  var missing = headers.filter(function (header) {
    return existingKeys.indexOf(headerKey_(header)) === -1;
  });
  if (!missing.length) return existing;
  sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  return existing.concat(missing);
}

/**
 * Read a tab as objects keyed by its own header row, with `_row` for updates.
 * Fully blank rows are skipped (they are invisible to the app but preserved).
 */
function readTable_(kind, sheetName) {
  var sheet = ensureSheet_(kind, sheetName);
  var headers = readHeaderRow_(sheet);
  if (!headers.length) return { sheet: sheet, headers: CONFIG.HEADERS[kind], rows: [] };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sheet: sheet, headers: headers, rows: [] };

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i += 1) {
    var raw = values[i];
    var blank = raw.every(function (cell) {
      return String(cell).trim() === '';
    });
    if (blank) continue;
    var record = { _row: i + 2 };
    for (var c = 0; c < headers.length; c += 1) {
      if (!headers[c]) continue;
      record[headers[c]] = raw[c];
    }
    rows.push(record);
  }
  return { sheet: sheet, headers: headers, rows: rows };
}

/** Map of header → 1-based column index, derived from the sheet's header row. */
function columnMap_(headers) {
  var map = {};
  headers.forEach(function (header, index) {
    if (header) map[String(header).trim()] = index + 1;
  });
  return map;
}

/** Append one record (object keyed by header). Values outside the header set are ignored. */
function appendRecord_(sheet, headers, record) {
  var row = headers.map(function (header) {
    var value = record[header];
    return value === undefined || value === null ? '' : value;
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}

/** Update selected fields of one existing row, addressed by its real row number. */
function updateRecord_(sheet, headers, rowNumber, record) {
  var columns = columnMap_(headers);
  Object.keys(record).forEach(function (header) {
    var column = columns[header];
    if (!column) return;
    var value = record[header];
    sheet.getRange(rowNumber, column).setValue(value === undefined || value === null ? '' : value);
  });
}

/** Delete exactly one row (used only by explicit admin "delete empty record" paths). */
function deleteRow_(sheet, rowNumber) {
  if (!rowNumber || rowNumber < 2) return;
  sheet.deleteRow(rowNumber);
}

/**
 * Write one column of derived values, preserving alignment even when the sheet
 * has blank rows in the middle: contiguous data is written as a single batch,
 * otherwise row by row.
 */
function writeColumn_(sheet, rows, header, headerRow, valueFor) {
  var column = headerRow[header];
  if (!column || !rows.length) return;
  var contiguous = rows.every(function (row, index) {
    return row._row === rows[0]._row + index;
  });
  if (contiguous) {
    sheet
      .getRange(rows[0]._row, column, rows.length, 1)
      .setValues(
        rows.map(function (row) {
          return [valueFor(row)];
        }),
      );
    return;
  }
  rows.forEach(function (row) {
    sheet.getRange(row._row, column).setValue(valueFor(row));
  });
}

/**
 * Run a mutation under the script lock so two concurrent requests cannot both
 * pass the same check. Sheets has no transactions, so critical paths re-read
 * their data inside the lock.
 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    throw appError_(ERR.CONFLICT, 'The library is busy processing another change. Please retry.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Sequential, collision-free ids: PREFIX-0001 derived from the highest existing number. */
function nextId_(prefix, rows, idHeader) {
  var max = 0;
  rows.forEach(function (row) {
    var value = String(row[idHeader] || '');
    var match = value.match(/(\d+)\s*$/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return prefix + '-' + String(max + 1).padStart(4, '0');
}
