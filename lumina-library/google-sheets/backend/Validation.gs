/**
 * Validation.gs — input validation, sanitisation and safe error handling.
 * Every value that reaches a cell passes through here.
 */
var ERR = {
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER: 'SERVER_ERROR',
  CONFIG: 'CONFIG_ERROR',
};

function appError_(code, message) {
  var err = new Error(message);
  err.appCode = code;
  return err;
}

/** Formula / CSV injection guard: a leading = + - @ is neutralised with a quote. */
function sanitizeText_(value, maxLength) {
  if (value === null || value === undefined) return '';
  var text = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  var limit = maxLength || 500;
  return text.length > limit ? text.slice(0, limit) : text;
}

function requireString_(value, field, min, max) {
  var text = sanitizeText_(value, max || 500);
  if (!text || text.length < (min || 1)) {
    throw appError_(ERR.VALIDATION, field + ' is required.');
  }
  return text;
}

function optionalString_(value, max) {
  return sanitizeText_(value, max || 500);
}

function requireEmail_(value) {
  var email = sanitizeText_(value, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw appError_(ERR.VALIDATION, 'Enter a valid email address.');
  }
  if (CONFIG.EMAIL_DOMAIN && email.split('@')[1] !== CONFIG.EMAIL_DOMAIN.toLowerCase()) {
    throw appError_(ERR.VALIDATION, 'Only @' + CONFIG.EMAIL_DOMAIN + ' addresses can sign in.');
  }
  return email;
}

function requireInt_(value, field, min, max) {
  var number = Number(value);
  if (!isFinite(number) || Math.floor(number) !== number) {
    throw appError_(ERR.VALIDATION, field + ' must be a whole number.');
  }
  if (number < min || number > max) {
    throw appError_(ERR.VALIDATION, field + ' must be between ' + min + ' and ' + max + '.');
  }
  return number;
}

function requireEnum_(value, field, allowed) {
  var text = String(value || '').toUpperCase().trim();
  if (allowed.indexOf(text) === -1) {
    throw appError_(ERR.VALIDATION, field + ' must be one of: ' + allowed.join(', ') + '.');
  }
  return text;
}

function requireId_(value, field) {
  var text = sanitizeText_(value, 60);
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(text)) {
    throw appError_(ERR.VALIDATION, (field || 'Identifier') + ' is invalid.');
  }
  return text;
}

function requirePassword_(value) {
  var password = String(value || '');
  if (password.length < CONFIG.MIN_PASSWORD_LENGTH) {
    throw appError_(ERR.VALIDATION, 'Password must be at least ' + CONFIG.MIN_PASSWORD_LENGTH + ' characters.');
  }
  if (password.length > 200) throw appError_(ERR.VALIDATION, 'Password is too long.');
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw appError_(ERR.VALIDATION, 'Password must contain at least one letter and one number.');
  }
  return password;
}

function parseIsoDate_(value, field) {
  var text = String(value || '').trim();
  if (!text) throw appError_(ERR.VALIDATION, field + ' is required.');
  var date = new Date(text);
  if (isNaN(date.getTime())) throw appError_(ERR.VALIDATION, field + ' is not a valid date.');
  return date;
}

/** Normalised API response envelope: { ok, data } or { ok, error: { code, message } }. */
function ok_(data) {
  return { ok: true, data: data === undefined ? null : data };
}

function fail_(code, message) {
  return { ok: false, error: { code: code, message: message } };
}

/** Never leak a stack trace, token or password hash to the client. */
function failFromError_(err) {
  var code = err && err.appCode ? err.appCode : ERR.SERVER;
  var message =
    code === ERR.SERVER
      ? 'The server could not complete that request. Please retry.'
      : err && err.message
        ? err.message
        : 'Request failed.';
  if (code === ERR.SERVER) {
    try {
      console.error('Lumina API error: ' + (err && err.message));
    } catch (ignored) {}
  }
  return fail_(code, message);
}
