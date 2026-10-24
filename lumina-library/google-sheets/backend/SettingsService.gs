/** SettingsService.gs — configurable library policy stored in the Settings tab. */
function readSettings_() {
  var store = readTable_('SETTINGS', CONFIG.SHEETS.SETTINGS);
  var settings = {};
  Object.keys(CONFIG.DEFAULT_SETTINGS).forEach(function (key) {
    settings[key] = CONFIG.DEFAULT_SETTINGS[key];
  });
  store.rows.forEach(function (row) {
    var key = String(row.Key || '').trim();
    if (key) settings[key] = String(row.Value === undefined ? '' : row.Value);
  });
  return { store: store, settings: settings };
}

function getSettings_(auth) {
  var result = readSettings_();
  return { settings: result.settings, editable: normaliseRole_(auth.user.Role) === ROLES.ADMIN };
}

function updateSettings_(auth, payload) {
  requireRole_(auth, [ROLES.ADMIN]);
  var patch = payload.settings || {};
  var allowed = Object.keys(CONFIG.DEFAULT_SETTINGS);
  var unknown = Object.keys(patch).filter(function (key) {
    return allowed.indexOf(key) === -1;
  });
  if (unknown.length) {
    throw appError_(ERR.VALIDATION, 'Unknown setting(s): ' + unknown.slice(0, 5).join(', '));
  }
  if (!Object.keys(patch).length) {
    throw appError_(ERR.VALIDATION, 'No settings were supplied.');
  }
  return withLock_(function () {
    var store = readSettings_();
    var now = new Date().toISOString();
    allowed.forEach(function (key) {
      if (!(key in patch)) return;
      var value = sanitizeText_(patch[key], 120);
      var existing = store.store.rows.filter(function (row) {
        return String(row.Key) === key;
      })[0];
      if (existing) {
        updateRecord_(store.store.sheet, store.store.headers, existing._row, { Value: value, 'Updated at': now });
      } else {
        appendRecord_(store.store.sheet, store.store.headers, { Key: key, Value: value, 'Updated at': now });
      }
    });
    logActivity_(String(auth.user['User ID']), 'settings.updated', 'settings', 'library', 'Updated library policy');
    return { settings: readSettings_().settings };
  });
}

/* ------------------------------------------------------------- policy helpers */

function settingNumber_(key) {
  var value = Number(readSettings_().settings[key]);
  return isFinite(value) && value >= 0 ? value : Number(CONFIG.DEFAULT_SETTINGS[key]) || 0;
}

function finePerDay_() {
  return settingNumber_('fine_per_day');
}

function borrowLimitFor_(user) {
  if (user['Borrowing limit'] !== '' && user['Borrowing limit'] !== undefined) {
    var custom = Number(user['Borrowing limit']);
    if (isFinite(custom)) return custom;
  }
  var role = normaliseRole_(user.Role);
  return role === ROLES.STUDENT ? settingNumber_('student_borrow_limit') : settingNumber_('faculty_borrow_limit');
}

function overdueDays_(dueDate) {
  var due = new Date(dueDate);
  if (isNaN(due.getTime())) return 0;
  var days = Math.floor((startOfDay_(new Date()).getTime() - startOfDay_(due).getTime()) / 86400000);
  return days > 0 ? days : 0;
}

function startOfDay_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays_(date, days) {
  var next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}
