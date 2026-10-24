/**
 * Setup.gs — one-time initialisation and diagnostics.
 *
 * Run these three functions from the Apps Script editor (select the function in
 * the toolbar, press Run), in this order:
 *
 *   1. setupLumina()          → creates ONLY missing tabs/headers, seeds settings,
 *                               seeds one administrator when none exists.
 *   2. verifyLuminaSetup()    → read-only report: tabs, headers, counts, permissions.
 *   3. (deploy the Web app, then) runLuminaApiSelfTest() → end-to-end call through
 *                               the deployed URL using the seeded admin.
 *
 * Nothing here deletes, renames, reorders or clears existing data. A dry run is
 * available: setupLumina(true) reports what it *would* do without writing.
 */

function setupLumina(dryRun) {
  var dry = dryRun === true;
  var log = [];
  var book = spreadsheet_();
  log.push('Spreadsheet: "' + book.getName() + '" (' + book.getId() + ')');
  log.push('Existing tabs: ' + book.getSheets().map(function (s) { return s.getName(); }).join(', '));
  log.push(dry ? 'MODE: dry run — nothing will be written.' : 'MODE: apply changes (append-only).');

  /* 1. Tabs + headers ------------------------------------------------------ */
  Object.keys(CONFIG.SHEETS).forEach(function (kind) {
    var name = CONFIG.SHEETS[kind];
    var existing = findSheet_(kind, name);
    if (existing) {
      var before = readHeaderRow_(existing);
      var beforeKeys = before.map(headerKey_);
      var missing = CONFIG.HEADERS[kind].filter(function (header) {
        return beforeKeys.indexOf(headerKey_(header)) === -1;
      });
      if (missing.length === 0) {
        log.push('  ok      ' + kind + ' → tab "' + existing.getName() + '" (headers complete, ' + Math.max(0, existing.getLastRow() - 1) + ' rows)');
      } else {
        if (!dry) ensureHeaders_(existing, CONFIG.HEADERS[kind]);
        log.push(
          '  append  ' + kind + ' → tab "' + existing.getName() + '" gains columns: ' + missing.join(', ') +
            (dry ? ' (not applied)' : '') + ' — existing columns and rows untouched',
        );
      }
      return;
    }
    if (!dry) ensureSheet_(kind, name);
    log.push('  create  ' + kind + ' → tab "' + name + '"' + (dry ? ' (not applied)' : ''));
  });

  /* 2. Settings ----------------------------------------------------------- */
  // In a dry run nothing may be created — readTable_ would create the tab — so the
  // existing Settings rows are inspected directly when the tab already exists.
  var settingsSheet = findSheet_('SETTINGS', CONFIG.SHEETS.SETTINGS);
  var existingSettings = {};
  if (settingsSheet) {
    var settingsRows = readTable_('SETTINGS', CONFIG.SHEETS.SETTINGS).rows;
    settingsRows.forEach(function (row) {
      var key = String(row.Key || '').trim();
      if (key) existingSettings[key] = String(row.Value === undefined ? '' : row.Value);
    });
  }
  var missingSettings = Object.keys(CONFIG.DEFAULT_SETTINGS).filter(function (key) {
    return !(key in existingSettings) || existingSettings[key] === '';
  });
  if (!dry && settingsSheet) {
    var store = readSettings_();
    missingSettings.forEach(function (key) {
      appendRecord_(store.store.sheet, store.store.headers, {
        Key: key,
        Value: CONFIG.DEFAULT_SETTINGS[key],
        'Updated at': new Date().toISOString(),
      });
    });
  } else if (!dry) {
    // Settings tab was created above; seed it through the normal path.
    var fresh = readSettings_();
    missingSettings.forEach(function (key) {
      appendRecord_(fresh.store.sheet, fresh.store.headers, {
        Key: key,
        Value: CONFIG.DEFAULT_SETTINGS[key],
        'Updated at': new Date().toISOString(),
      });
    });
  }
  log.push(
    '  settings: ' +
      (missingSettings.length
        ? (dry ? 'would seed ' : 'seeded ') + missingSettings.join(', ')
        : 'all keys present, nothing to do'),
  );

  /* 3. First administrator ------------------------------------------------ */
  var usersSheetFound = findSheet_('USERS', CONFIG.SHEETS.USERS);
  var existingUsers = usersSheetFound ? readTable_('USERS', CONFIG.SHEETS.USERS).rows : [];
  var hasAdmin = existingUsers.some(function (row) {
    return normaliseRole_(row.Role) === ROLES.ADMIN && String(row['Account status']).toUpperCase() === STATUS.ACTIVE;
  });
  if (hasAdmin) {
    log.push('  admin: an ACTIVE administrator already exists — left untouched.');
  } else if (dry) {
    log.push('  admin: would seed one administrator (no ACTIVE admin found).');
  } else {
    var props = PropertiesService.getScriptProperties();
    var email = props.getProperty('SEED_ADMIN_EMAIL') || 'admin@lumina.edu';
    var password = props.getProperty('SEED_ADMIN_PASSWORD');
    if (!password) {
      password = 'Lumina@' + Math.floor(1000 + Math.random() * 9000);
      props.setProperty('SEED_ADMIN_PASSWORD', password);
    }
    var users = readTable_('USERS', CONFIG.SHEETS.USERS);
    var salt = newSalt_();
    var now = new Date().toISOString();
    appendRecord_(users.sheet, users.headers, {
      'User ID': nextId_('U', users.rows, 'User ID'),
      Name: 'Library Administrator',
      Email: email,
      'Institutional ID': 'ADMIN-001',
      Role: 'ADMIN',
      Department: 'Library',
      'Account status': 'ACTIVE',
      'Password salt': salt,
      'Password hash': hashPassword_(password, salt, CONFIG.HASH_ITERATIONS),
      'Hash iterations': CONFIG.HASH_ITERATIONS,
      Phone: '',
      'Borrowing limit': '',
      'Created at': now,
      'Updated at': now,
    });
    log.push('  admin: seeded ' + email + ' (password stored in Script property SEED_ADMIN_PASSWORD).');
    log.push('         Sign in once and change it from Profile → Change password.');
  }

  log.push('');
  log.push('Next: run verifyLuminaSetup(), then Deploy → New deployment → Web app');
  log.push('      (Execute as: Me, Who has access: Anyone) and copy the /exec URL.');

  var output = log.join('\n');
  try {
    console.log(output);
  } catch (ignored) {}
  return output;
}

/**
 * Read-only health report for the spreadsheet itself.
 * Checks: spreadsheet access, every tab, every canonical header, write permission,
 * the administrator account, settings keys and the runtime configuration.
 */
function verifyLuminaSetup() {
  var checks = [];
  function check(name, ok, detail) {
    checks.push({ name: name, ok: ok === true, detail: detail || '' });
    return ok;
  }
  /** A note about the owner's existing data: reported, but it does not fail setup. */
  function advisory(name, detail) {
    checks.push({ name: name, ok: true, advisory: true, detail: detail || '' });
    return true;
  }

  var book = null;
  try {
    book = spreadsheet_();
    check('Spreadsheet is readable', true, '"' + book.getName() + '" · ' + book.getId());
  } catch (err) {
    check('Spreadsheet is readable', false, String(err && err.message));
  }

  if (book) {
    /* Write permission: rewrite the existing value of one cell with itself. */
    try {
      var probe = readTable_('SETTINGS', CONFIG.SHEETS.SETTINGS);
      var target = probe.rows.length ? probe.rows[0] : null;
      if (target) {
        var column = columnMap_(probe.headers).Value;
        var current = probe.sheet.getRange(target._row, column).getValue();
        probe.sheet.getRange(target._row, column).setValue(current);
        check('Spreadsheet is writable', true, 'Settings!Value rewritten with its own value (no data changed)');
      } else {
        check('Spreadsheet is writable', true, 'Settings tab is empty — skipped the write probe');
      }
    } catch (err) {
      check('Spreadsheet is writable', false, String(err && err.message));
    }

    var tables = {};
    Object.keys(CONFIG.SHEETS).forEach(function (kind) {
      var sheet = findSheet_(kind, CONFIG.SHEETS[kind]);
      if (!sheet) {
        check('Tab for ' + kind, false, 'missing — run setupLumina()');
        tables[kind] = { tab: null, rows: 0, missing: CONFIG.HEADERS[kind] };
        return;
      }
      var headers = readHeaderRow_(sheet);
      var headerKeys = headers.map(headerKey_);
      var missing = CONFIG.HEADERS[kind].filter(function (header) {
        return headerKeys.indexOf(headerKey_(header)) === -1;
      });
      var rows = Math.max(0, sheet.getLastRow() - 1);
      tables[kind] = { tab: sheet.getName(), rows: rows, missing: missing };
      check(
        'Tab for ' + kind,
        missing.length === 0,
        '"' + sheet.getName() + '" · ' + rows + ' rows' + (missing.length ? ' · missing: ' + missing.join(', ') : ''),
      );
    });

    try {
      var users = readTable_('USERS', CONFIG.SHEETS.USERS);
      var admins = users.rows.filter(function (row) {
        return normaliseRole_(row.Role) === ROLES.ADMIN && String(row['Account status']).toUpperCase() === STATUS.ACTIVE;
      });
      check('An ACTIVE administrator exists', admins.length > 0, admins.length ? admins.length + ' admin account(s)' : 'run setupLumina()');
      var plain = users.rows.filter(function (row) {
        var hash = String(row['Password hash'] || '');
        return hash && hash.length < 32;
      });
      check('No obviously malformed password hashes', plain.length === 0, plain.length ? plain.length + ' row(s) look wrong' : 'all hashes are present');
    } catch (err) {
      check('Users tab can be read', false, String(err && err.message));
    }

    try {
      var books = readTable_('BOOKS', CONFIG.SHEETS.BOOKS).rows;
      var incomplete = books.filter(function (row) {
        var copies = Number(row['Total copies']);
        return !(copies > 0) || !String(row.Title || '').trim() || !String(row.Author || '').trim();
      });
      if (incomplete.length === 0) {
        check('Catalogue rows are complete', true, books.length + ' rows');
      } else {
        advisory(
          'Catalogue rows need attention',
          incomplete.length +
            ' row(s) have a blank title, author or copy count: ' +
            incomplete
              .slice(0, 5)
              .map(function (row) {
                return String(row['Book ID']);
              })
              .join(', ') +
            '. They are kept and shown with one placeholder copy — complete or delete them in the sheet. This is your data, so it does not fail setup.',
        );
      }
    } catch (err) {
      check('Catalogue rows are complete', false, String(err && err.message));
    }

    try {
      var settings = readSettings_().settings;
      var absent = Object.keys(CONFIG.DEFAULT_SETTINGS).filter(function (key) {
        return !(key in settings);
      });
      check('Policy settings present', absent.length === 0, absent.length ? 'missing: ' + absent.join(', ') : Object.keys(settings).length + ' keys');
    } catch (err) {
      check('Policy settings present', false, String(err && err.message));
    }

    check('Time zone', true, book.getSpreadsheetTimeZone());
  }

  try {
    var props = PropertiesService.getScriptProperties();
    var configuredId = props.getProperty('SPREADSHEET_ID');
    check(
      'SPREADSHEET_ID script property',
      !configuredId || configuredId === CONFIG.SPREADSHEET_ID,
      configuredId ? 'set to ' + configuredId : 'not set — using the id compiled into Config.gs',
    );
    var seedEmail = props.getProperty('SEED_ADMIN_EMAIL');
    check('SEED_ADMIN_EMAIL script property', Boolean(seedEmail), seedEmail || 'not set — defaults to admin@lumina.edu');
  } catch (err) {
    check('Script properties readable', false, String(err && err.message));
  }

  try {
    var effective = Session.getEffectiveUser().getEmail();
    var active = '';
    try {
      active = Session.getActiveUser().getEmail();
    } catch (ignored) {}
    check('Running as', true, effective + (active && active !== effective ? ' (caller: ' + active + ')' : ''));
  } catch (err) {
    check('Running as', true, 'unknown');
  }

  var failed = checks.filter(function (item) {
    return !item.ok;
  });
  var lines = ['Lumina API v' + CONFIG.VERSION + ' — setup verification', ''];
  checks.forEach(function (item) {
    var tag = item.advisory ? '  WARN  ' : item.ok ? '  PASS  ' : '  FAIL  ';
    lines.push(tag + item.name + (item.detail ? ' — ' + item.detail : ''));
  });
  lines.push('');
  lines.push(failed.length === 0 ? 'Everything looks good. Deploy the Web app next.' : failed.length + ' check(s) failed — see above.');
  lines.push('Reminder: Deploy → Manage deployments → Web app → Execute as "Me", Who has access "Anyone".');

  var output = lines.join('\n');
  try {
    console.log(output);
  } catch (ignored) {}
  return output;
}

/**
 * Emergency recovery: sets a fresh random password for one account and stores it
 * in a script property. Run manually from the editor only — never exposed as an
 * API action.
 */
function resetAdminPassword() {
  var props = PropertiesService.getScriptProperties();
  var email = (props.getProperty('SEED_ADMIN_EMAIL') || '').toLowerCase();
  var users = readTable_('USERS', CONFIG.SHEETS.USERS);
  var admin =
    users.rows.filter(function (row) {
      return normaliseRole_(row.Role) === ROLES.ADMIN && (!email || String(row.Email).toLowerCase() === email);
    })[0] || null;
  if (!admin) return 'No administrator account found. Run setupLumina() first.';
  var password = 'Lumina@' + Math.floor(1000 + Math.random() * 9000);
  var salt = newSalt_();
  updateRecord_(users.sheet, users.headers, admin._row, {
    'Password salt': salt,
    'Password hash': hashPassword_(password, salt, CONFIG.HASH_ITERATIONS),
    'Hash iterations': CONFIG.HASH_ITERATIONS,
    'Updated at': new Date().toISOString(),
  });
  props.setProperty('SEED_ADMIN_PASSWORD', password);
  var message = 'Password reset for ' + admin.Email + '. New password is in the script property SEED_ADMIN_PASSWORD.';
  try {
    console.log(message);
  } catch (ignored) {}
  return message;
}

/**
 * End-to-end self test through the deployed Web app.
 * Set the script property API_BASE_URL to your /exec URL first, then run this.
 * It only creates one uniquely-named book and then deletes it again.
 */
function runLuminaApiSelfTest() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('API_BASE_URL');
  if (!url) return 'Set the script property API_BASE_URL to your deployed /exec URL first.';
  var email = props.getProperty('SEED_ADMIN_EMAIL') || 'admin@lumina.edu';
  var password = props.getProperty('SEED_ADMIN_PASSWORD');
  if (!password) return 'No SEED_ADMIN_PASSWORD script property — run setupLumina() or resetAdminPassword() first.';

  var lines = [];
  function post(action, payload, token) {
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'text/plain;charset=utf-8',
      payload: JSON.stringify({ action: action, payload: payload || {}, token: token || null }),
      followRedirects: true,
      muteHttpExceptions: true,
    });
    return JSON.parse(response.getContentText());
  }

  var health = post('health');
  lines.push((health.ok ? 'PASS' : 'FAIL') + ' health — ' + (health.ok ? 'v' + health.data.version : JSON.stringify(health.error)));

  var login = post('auth.login', { identifier: email, password: password });
  lines.push((login.ok ? 'PASS' : 'FAIL') + ' auth.login — ' + (login.ok ? login.data.user.role : JSON.stringify(login.error)));
  if (!login.ok) {
    var out = lines.join('\n');
    console.log(out);
    return out;
  }
  var token = login.data.token;

  var boot = post('bootstrap', {}, token);
  lines.push((boot.ok ? 'PASS' : 'FAIL') + ' bootstrap — ' + (boot.ok ? boot.data.books.length + ' books, scope ' + boot.data.scope : JSON.stringify(boot.error)));

  var title = 'Self-test ' + new Date().toISOString().slice(0, 19);
  var created = post('books.create', { title: title, author: 'Setup check', totalCopies: 1 }, token);
  lines.push((created.ok ? 'PASS' : 'FAIL') + ' books.create — ' + (created.ok ? created.data.book.bookId : JSON.stringify(created.error)));
  if (created.ok) {
    var removed = post('books.delete', { bookId: created.data.book.bookId }, token);
    lines.push((removed.ok ? 'PASS' : 'FAIL') + ' books.delete (cleanup) — ' + (removed.ok ? 'removed' : JSON.stringify(removed.error)));
  }

  var out = lines.join('\n');
  console.log(out);
  return out;
}
