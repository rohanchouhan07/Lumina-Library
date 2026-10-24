/**
 * Local stand-in for the Lumina Apps Script backend.
 * Speaks the same contract as google-sheets/backend (action-based POST, bearer
 * token, { ok, data | error }) so the React app can be tested end-to-end without
 * a Google deployment. NOT a production server — in-memory, single process.
 */
import http from 'node:http'
import crypto from 'node:crypto'

const PORT = Number(process.env.PORT || 8100)
const HASH_ROUNDS = 1000

const nowISO = () => new Date().toISOString()
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex')
const hashPassword = (password, salt, rounds = HASH_ROUNDS) => {
  let value = `${salt}:${password}`
  for (let i = 0; i < rounds; i += 1) value = crypto.createHmac('sha256', `${salt}:${i}`).update(value).digest('hex')
  return value
}
const newSalt = () => crypto.randomBytes(16).toString('hex')
const newToken = () => crypto.randomBytes(32).toString('hex')
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const overdueDays = (due) => {
  const diff = Math.floor((startOfDay(new Date()) - startOfDay(new Date(due))) / 86400000)
  return Number.isNaN(diff) || diff < 0 ? 0 : diff
}
const addDays = (date, days) => {
  const next = new Date(date.getTime())
  next.setDate(next.getDate() + days)
  return next
}
const sanitizeText = (value, max = 500) => {
  let text = String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim()
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return text.slice(0, max)
}

class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}
const fail = (code, message) => {
  throw new ApiError(code, message)
}

/* ------------------------------------------------------------------- store */
const db = {
  users: [],
  books: [],
  loans: [],
  reservations: [],
  activity: [],
  settings: {},
  wishlists: [],
  sessions: new Map(),
  attempts: new Map(),
}

const DEFAULT_SETTINGS = {
  library_name: 'Lumina Central Library',
  loan_duration_days: '14',
  max_renewals: '2',
  renewal_extension_days: '14',
  fine_per_day: '5',
  student_borrow_limit: '4',
  faculty_borrow_limit: '8',
  reservation_hold_days: '3',
  allow_self_checkout: 'false',
  block_issue_on_unpaid_fines: 'false',
  fine_block_threshold: '100',
}

function seed() {
  db.users = []
  db.books = []
  db.loans = []
  db.reservations = []
  db.activity = []
  db.wishlists = []
  db.sessions.clear()
  db.attempts.clear()
  db.settings = { ...DEFAULT_SETTINGS }

  const people = [
    ['U-0001', 'Dr. Meera Kulkarni', 'admin@lumina.edu', 'ADMIN-001', 'ADMIN', 'Library', 'Lumina@2026'],
    ['U-0002', 'Arjun Nair', 'faculty@lumina.edu', 'FAC-014', 'FACULTY', 'Computer Science', 'Faculty@2026'],
    ['U-0005', 'Nisha Verma', 'librarian@lumina.edu', 'LIB-002', 'LIBRARIAN', 'Library', 'Librarian@2026'],
    ['U-0003', 'Riya Sharma', 'student@lumina.edu', 'M-1004', 'STUDENT', 'Computer Science', 'Student@2026'],
    ['U-0004', 'Aditya Verma', 'aditya.verma@lumina.edu', 'M-1005', 'STUDENT', 'Mathematics', 'Student@2026'],
    ['U-0006', 'Inactive Tester', 'inactive@lumina.edu', 'M-1006', 'STUDENT', 'Physics', 'Student@2026', 'INACTIVE'],
  ]
  people.forEach(([id, name, email, inst, role, dept, password, status]) => {
    const salt = newSalt()
    db.users.push({
      'User ID': id,
      Name: name,
      Email: email,
      'Institutional ID': inst,
      Role: role,
      Department: dept,
      'Account status': status || 'ACTIVE',
      'Password salt': salt,
      'Password hash': hashPassword(password, salt),
      'Hash iterations': HASH_ROUNDS,
      Phone: '',
      'Borrowing limit': '',
      'Created at': nowISO(),
      'Updated at': nowISO(),
    })
  })

  const books = [
    ['BK-001', 'Clean Code', 'Robert C. Martin', '978-0132350884', 'Prentice Hall', 2008, 'Computer Science', 'CS-A01', 3],
    ['BK-002', 'Introduction to Algorithms', 'Thomas H. Cormen', '978-0262033848', 'MIT Press', 2009, 'Computer Science', 'CS-A02', 2],
    ['BK-003', 'The Pragmatic Programmer', 'Andrew Hunt', '978-0201616224', 'Addison-Wesley', 1999, 'Programming', 'CS-B01', 2],
    ['BK-004', 'Design Patterns', 'Erich Gamma', '978-0201633610', 'Addison-Wesley', 1994, 'Programming', 'CS-B02', 1],
    ['BK-005', 'Calculus, Volume 1', 'Tom M. Apostol', '978-0471000051', 'Wiley', 1967, 'Mathematics', 'MA-A01', 4],
    ['BK-006', 'A Brief History of Time', 'Stephen Hawking', '978-0553380163', 'Bantam', 1988, 'Science', 'SC-A01', 2],
    ['BK-007', 'The Great Gatsby', 'F. Scott Fitzgerald', '978-0743273565', 'Scribner', 1925, 'Literature', 'LI-A01', 1],
    ['BK-008', 'Thinking, Fast and Slow', 'Daniel Kahneman', '978-0374533557', 'Farrar, Straus and Giroux', 2011, 'Psychology', 'PS-A01', 2],
  ]
  books.forEach(([id, title, author, isbn, publisher, year, category, shelf, copies]) => {
    db.books.push({
      'Book ID': id,
      Title: title,
      Author: author,
      ISBN: isbn,
      Publisher: publisher,
      Year: year,
      Category: category,
      Shelf: shelf,
      'Total copies': copies,
      Status: 'ACTIVE',
      Added: '2025-01-05T00:00:00.000Z',
      Description: '',
      'Created at': '2025-01-05T00:00:00.000Z',
      'Updated at': nowISO(),
    })
  })

  const seedLoans = [
    ['LN-0001', 'BK-001', 'U-0003', -20, 14],
    ['LN-0002', 'BK-002', 'U-0003', -30, 14],
    ['LN-0003', 'BK-007', 'U-0002', -5, 14],
  ]
  seedLoans.forEach(([id, bookId, userId, issuedOffset, dueIn]) => {
    const issued = addDays(new Date(), issuedOffset)
    db.loans.push({
      'Loan ID': id,
      'Book ID': bookId,
      'User ID': userId,
      'Issued by': 'U-0001',
      'Issue date': issued.toISOString(),
      'Due date': addDays(issued, dueIn).toISOString(),
      'Return date': '',
      'Loan status': 'ACTIVE',
      'Renewal count': 0,
      'Fine amount': '',
      'Created at': issued.toISOString(),
      'Updated at': issued.toISOString(),
    })
  })

  db.reservations.push({
    'Reservation ID': 'RS-0001',
    'Book ID': 'BK-004',
    'User ID': 'U-0003',
    'Reservation date': addDays(new Date(), -2).toISOString(),
    'Queue position': 1,
    'Reservation status': 'PENDING',
    'Expiry date': '',
    'Created at': nowISO(),
    'Updated at': nowISO(),
  })

  logActivity('SYSTEM', 'system.seed', 'library', 'demo', 'Seeded demo data')
}

/* ---------------------------------------------------------------- helpers */
const roleOf = (value) => {
  const role = String(value || '').toUpperCase().trim()
  if (role === 'LIBRARIAN' || role === 'STAFF' || role === 'DESK') return 'LIBRARIAN'
  if (role === 'TEACHER') return 'FACULTY'
  if (role === 'ADMINISTRATOR') return 'ADMIN'
  return ['ADMIN', 'LIBRARIAN', 'FACULTY', 'STUDENT'].includes(role) ? role : 'STUDENT'
}
const isStaff = (role) => role === 'ADMIN' || role === 'LIBRARIAN'
const publicUser = (user) => ({
  userId: user['User ID'],
  name: user.Name,
  email: String(user.Email).toLowerCase(),
  institutionalId: user['Institutional ID'],
  role: roleOf(user.Role),
  department: user.Department,
  accountStatus: String(user['Account status']).toUpperCase(),
  phone: user.Phone || '',
  borrowingLimit: user['Borrowing limit'] === '' || user['Borrowing limit'] === undefined ? null : Number(user['Borrowing limit']),
  createdAt: user['Created at'],
  updatedAt: user['Updated at'],
})
const userId = (user) => user['User ID']
const findById = (rows, key, id) => rows.find((row) => String(row[key]) === String(id))
const settingNumber = (key) => {
  const value = Number(db.settings[key])
  return Number.isFinite(value) && value >= 0 ? value : Number(DEFAULT_SETTINGS[key]) || 0
}
const finePerDay = () => settingNumber('fine_per_day')

function logActivity(actorId, action, entityType, entityId, summary) {
  db.activity.unshift({
    'Activity ID': `AC-${String(db.activity.length + 1).padStart(4, '0')}`,
    'Actor user ID': actorId,
    Action: action,
    'Entity type': entityType,
    'Entity ID': entityId,
    Timestamp: nowISO(),
    Summary: sanitizeText(summary, 300),
  })
  db.activity = db.activity.slice(0, 400)
}

function session(authHeaderToken) {
  const record = db.sessions.get(authHeaderToken)
  if (!record) fail('UNAUTHORIZED', 'Your session has expired. Sign in again.')
  if (record.revoked) fail('UNAUTHORIZED', 'Your session has ended. Sign in again.')
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    db.sessions.delete(authHeaderToken)
    fail('UNAUTHORIZED', 'Your session has expired. Sign in again.')
  }
  const user = findById(db.users, 'User ID', record.userId)
  if (!user) fail('UNAUTHORIZED', 'This account no longer exists.')
  if (String(user['Account status']).toUpperCase() !== 'ACTIVE') {
    fail('FORBIDDEN', 'This account is deactivated. Contact the library administrator.')
  }
  return { user, token: authHeaderToken }
}

/** A librarian may not act on an administrator account. */
const assertCanManageTarget = (auth, target) => {
  const actor = roleOf(auth.user.Role)
  if (actor === 'ADMIN') return
  if (roleOf(target.Role) === 'ADMIN') {
    fail('FORBIDDEN', 'Only an administrator can manage an administrator account.')
  }
}
const assertAssignableRole = (auth, role) => {
  const actor = roleOf(auth.user.Role)
  if (actor === 'ADMIN') return
  if (role === 'ADMIN') fail('FORBIDDEN', 'Only an administrator can assign the administrator role.')
}

const requireRole = (auth, allowed) => {
  const role = roleOf(auth.user.Role)
  if (!allowed.includes(role)) fail('FORBIDDEN', 'Your role does not allow this action.')
  return role
}

const activeLoansFor = (bookId) => db.loans.filter((loan) => loan['Book ID'] === bookId && loan['Loan status'] === 'ACTIVE')
const mapBook = (book) => {
  const total = Math.max(1, Number(book['Total copies']) || 1)
  const onLoan = activeLoansFor(book['Book ID']).length
  return {
    bookId: book['Book ID'],
    title: book.Title,
    author: book.Author,
    isbn: book.ISBN || '',
    publisher: book.Publisher || '',
    year: Number(book.Year) || 0,
    category: book.Category || 'General',
    description: book.Description || '',
    coverImageUrl: book['Cover image URL'] || '',
    shelfLocation: book.Shelf || '',
    totalCopies: total,
    availableCopies: Math.max(0, total - onLoan),
    copiesOnLoan: onLoan,
    recordStatus: String(book.Status).toUpperCase() === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    createdAt: book['Created at'] || book.Added || '',
    updatedAt: book['Updated at'] || '',
  }
}
const mapLoan = (loan) => {
  const book = findById(db.books, 'Book ID', loan['Book ID'])
  const user = findById(db.users, 'User ID', loan['User ID'])
  const status = String(loan['Loan status']).toUpperCase() === 'RETURNED' ? 'RETURNED' : 'ACTIVE'
  return {
    loanId: loan['Loan ID'],
    bookId: loan['Book ID'],
    bookTitle: book ? book.Title : '',
    userId: loan['User ID'],
    userName: user ? user.Name : '',
    issuedBy: loan['Issued by'] || '',
    issueDate: loan['Issue date'],
    dueDate: loan['Due date'],
    returnDate: loan['Return date'] || null,
    loanStatus: status,
    renewalCount: Number(loan['Renewal count']) || 0,
    fineAmount: status === 'ACTIVE' ? overdueDays(loan['Due date']) * finePerDay() : Number(loan['Fine amount']) || 0,
    overdueDays: status === 'ACTIVE' ? overdueDays(loan['Due date']) : 0,
    createdAt: loan['Created at'],
    updatedAt: loan['Updated at'],
  }
}
const mapReservation = (row) => {
  const book = findById(db.books, 'Book ID', row['Book ID'])
  const user = findById(db.users, 'User ID', row['User ID'])
  return {
    reservationId: row['Reservation ID'],
    bookId: row['Book ID'],
    bookTitle: book ? book.Title : '',
    userId: row['User ID'],
    userName: user ? user.Name : '',
    reservationDate: row['Reservation date'],
    queuePosition: Number(row['Queue position']) || 0,
    reservationStatus: String(row['Reservation status']).toUpperCase(),
    expiryDate: row['Expiry date'] || null,
    createdAt: row['Created at'],
    updatedAt: row['Updated at'],
  }
}
const nextId = (prefix, rows, key) => {
  const max = rows.reduce((acc, row) => {
    const match = String(row[key] || '').match(/(\d+)\s*$/)
    return match ? Math.max(acc, Number(match[1])) : acc
  }, 0)
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}
const unpaidFines = (id) =>
  db.loans.reduce((sum, loan) => {
    if (loan['User ID'] !== id) return sum
    if (loan['Loan status'] === 'ACTIVE') return sum + overdueDays(loan['Due date']) * finePerDay()
    return sum + (Number(loan['Fine amount']) || 0)
  }, 0)
const borrowLimit = (user) => {
  if (user['Borrowing limit'] !== '' && user['Borrowing limit'] !== undefined) return Number(user['Borrowing limit'])
  return roleOf(user.Role) === 'STUDENT' ? settingNumber('student_borrow_limit') : settingNumber('faculty_borrow_limit')
}

function dashboard(auth) {
  const role = roleOf(auth.user.Role)
  const id = userId(auth.user)
  const users = db.users
  const copies = db.books.filter((b) => b.Title).reduce((sum, b) => sum + Math.max(1, Number(b['Total copies']) || 1), 0)
  const onLoan = db.loans.filter((l) => l['Loan status'] === 'ACTIVE').length
  return {
    scope: isStaff(role) ? 'LIBRARY' : 'SELF',
    totals: {
      titles: db.books.filter((b) => b.Title).length,
      copies,
      availableCopies: Math.max(0, copies - onLoan),
      members: users.length,
      students: users.filter((u) => roleOf(u.Role) === 'STUDENT').length,
      faculty: users.filter((u) => roleOf(u.Role) === 'FACULTY').length,
      admins: users.filter((u) => roleOf(u.Role) === 'ADMIN').length,
      activeLoans: onLoan,
      overdue: db.loans.filter((l) => l['Loan status'] === 'ACTIVE' && overdueDays(l['Due date']) > 0).length,
      activeHolds: db.reservations.filter((r) => ['PENDING', 'READY'].includes(r['Reservation status'])).length,
      simulatedFines: db.loans.reduce(
        (sum, l) =>
          sum + (l['Loan status'] === 'ACTIVE' ? overdueDays(l['Due date']) * finePerDay() : Number(l['Fine amount']) || 0),
        0,
      ),
    },
    mine: {
      activeLoans: db.loans.filter((l) => l['User ID'] === id && l['Loan status'] === 'ACTIVE').length,
      overdue: db.loans.filter((l) => l['User ID'] === id && l['Loan status'] === 'ACTIVE' && overdueDays(l['Due date']) > 0).length,
      holds: db.reservations.filter((r) => r['User ID'] === id && ['PENDING', 'READY'].includes(r['Reservation status'])).length,
      simulatedFines: unpaidFines(id),
      borrowLimit: borrowLimit(auth.user),
    },
  }
}

/* --------------------------------------------------------------- actions */
const actions = {
  health: () => ({
    service: 'lumina-library-api',
    version: '2.1.0-mock',
    tabs: ['Books', 'Users', 'Loans', 'Reservations', 'ActivityLogs', 'Settings', 'Sessions', 'Wishlists'],
    counts: {
      books: db.books.length,
      users: db.users.length,
      loans: db.loans.length,
      reservations: db.reservations.length,
    },
    time: nowISO(),
  }),

  'auth.login': (auth, { payload }) => {
    const identifier = sanitizeText(payload.identifier, 200).toLowerCase()
    const password = String(payload.password || '')
    if (!identifier || !password) fail('VALIDATION_ERROR', 'Enter your email or institutional ID and your password.')
    const attempt = db.attempts.get(identifier)
    if (attempt && attempt.count >= 8 && Date.now() - attempt.first < 15 * 60000) {
      fail('RATE_LIMITED', 'Too many attempts. Wait a few minutes and try again.')
    }
    const user = db.users.find(
      (u) => String(u.Email).toLowerCase() === identifier || String(u['Institutional ID']).toLowerCase() === identifier,
    )
    if (!user || hashPassword(password, user['Password salt'], user['Hash iterations']) !== user['Password hash']) {
      const record = attempt && Date.now() - attempt.first < 15 * 60000 ? attempt : { first: Date.now(), count: 0 }
      record.count += 1
      db.attempts.set(identifier, record)
      fail('UNAUTHORIZED', 'Email/ID or password is incorrect.')
    }
    if (String(user['Account status']).toUpperCase() !== 'ACTIVE') {
      fail('FORBIDDEN', 'This account is deactivated. Contact the library administrator.')
    }
    db.attempts.delete(identifier)
    const token = newToken()
    const hours = payload.remember ? 12 * 30 : 12
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString()
    db.sessions.set(token, { userId: userId(user), expiresAt, revoked: false })
    logActivity(userId(user), 'auth.login', 'user', userId(user), 'Signed in')
    return { token, expiresAt, user: publicUser(user) }
  },

  'auth.session': (auth) => ({ user: publicUser(auth.user) }),

  'auth.logout': (auth) => {
    db.sessions.delete(auth.token)
    logActivity(userId(auth.user), 'auth.logout', 'user', userId(auth.user), 'Signed out')
    return { loggedOut: true }
  },

  'auth.changePassword': (auth, { payload }) => {
    const user = auth.user
    if (hashPassword(String(payload.currentPassword || ''), user['Password salt'], user['Hash iterations']) !== user['Password hash']) {
      fail('UNAUTHORIZED', 'Your current password is incorrect.')
    }
    const next = String(payload.newPassword || '')
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) {
      fail('VALIDATION_ERROR', 'Password must be at least 8 characters and contain a letter and a number.')
    }
    const salt = newSalt()
    user['Password salt'] = salt
    user['Password hash'] = hashPassword(next, salt, HASH_ROUNDS)
    user['Hash iterations'] = HASH_ROUNDS
    logActivity(userId(user), 'user.password', 'user', userId(user), 'Changed own password')
    return { changed: true }
  },

  bootstrap: (auth) => {
    const role = roleOf(auth.user.Role)
    const staff = isStaff(role)
    return {
      user: publicUser(auth.user),
      role,
      scope: staff ? 'ALL' : 'SELF',
      books: db.books.filter((b) => b.Title).map(mapBook),
      users: staff ? db.users.map(publicUser) : [publicUser(auth.user)],
      loans: db.loans.filter((l) => staff || l['User ID'] === userId(auth.user)).map(mapLoan),
      reservations: db.reservations.filter((r) => staff || r['User ID'] === userId(auth.user)).map(mapReservation),
      settings: { ...db.settings },
      activity: db.activity
        .filter((a) => staff || a['Actor user ID'] === userId(auth.user))
        .slice(0, 40)
        .map((a) => ({
          activityId: a['Activity ID'],
          actorUserId: a['Actor user ID'],
          action: a.Action,
          entityType: a['Entity type'],
          entityId: a['Entity ID'],
          timestamp: a.Timestamp,
          summary: a.Summary,
        })),
      wishlist: db.wishlists.filter((w) => w['User ID'] === userId(auth.user)).map((w) => ({ bookId: w['Book ID'], createdAt: w['Created at'] })),
      stats: dashboard(auth),
      serverTime: nowISO(),
    }
  },

  'books.list': () => ({ books: db.books.filter((b) => b.Title).map(mapBook), total: db.books.length }),

  'books.get': (auth, { payload }) => {
    const book = findById(db.books, 'Book ID', String(payload.bookId))
    if (!book) fail('NOT_FOUND', 'That book does not exist.')
    return { book: mapBook(book) }
  },

  'books.create': (auth, { payload }) => {
    requireRole(auth, ['ADMIN', 'LIBRARIAN'])
    const title = sanitizeText(payload.title, 300)
    if (!title) fail('VALIDATION_ERROR', 'Title is required.')
    const copies = Number(payload.totalCopies)
    if (!Number.isInteger(copies) || copies < 1 || copies > 999) {
      fail('VALIDATION_ERROR', 'Total copies must be a whole number between 1 and 999.')
    }
    if (payload.year !== undefined && payload.year !== '' && payload.year !== null) {
      const year = Number(payload.year)
      if (!Number.isInteger(year) || year < 1400 || year > 2100) {
        fail('VALIDATION_ERROR', 'Year must be between 1400 and 2100.')
      }
    }
    if (db.books.some((b) => String(b.Title).toLowerCase() === title.toLowerCase())) {
      fail('CONFLICT', 'A book with that title already exists.')
    }
    const book = {
      'Book ID': nextId('BK', db.books, 'Book ID'),
      Title: title,
      Author: sanitizeText(payload.author, 200) || 'Unknown author',
      ISBN: sanitizeText(payload.isbn, 40),
      Publisher: sanitizeText(payload.publisher, 160),
      Year: Number(payload.year) || 0,
      Category: sanitizeText(payload.category, 80) || 'General',
      Shelf: sanitizeText(payload.shelf, 40),
      'Total copies': copies,
      Status: 'ACTIVE',
      Added: nowISO(),
      Description: sanitizeText(payload.description, 2000),
      'Created at': nowISO(),
      'Updated at': nowISO(),
    }
    db.books.push(book)
    logActivity(userId(auth.user), 'book.created', 'book', book['Book ID'], `Added "${book.Title}"`)
    return { book: mapBook(book) }
  },

  'books.update': (auth, { payload }) => {
    requireRole(auth, ['ADMIN', 'LIBRARIAN'])
    const book = findById(db.books, 'Book ID', String(payload.bookId))
    if (!book) fail('NOT_FOUND', 'That book does not exist.')
    const active = activeLoansFor(book['Book ID']).length
    const total = Number(payload.totalCopies)
    if (!Number.isInteger(total) || total < 1 || total > 999) {
      fail('VALIDATION_ERROR', 'Total copies must be a whole number between 1 and 999.')
    }
    if (total < active) fail('CONFLICT', `Total copies cannot be below the ${active} copies currently on loan.`)
    Object.assign(book, {
      Title: sanitizeText(payload.title, 300) || book.Title,
      Author: sanitizeText(payload.author, 200) || book.Author,
      ISBN: sanitizeText(payload.isbn, 40),
      Publisher: sanitizeText(payload.publisher, 160),
      Year: Number(payload.year) || book.Year,
      Category: sanitizeText(payload.category, 80) || book.Category,
      Shelf: sanitizeText(payload.shelf, 40),
      'Total copies': total,
      Description: sanitizeText(payload.description, 2000),
      'Updated at': nowISO(),
    })
    logActivity(userId(auth.user), 'book.updated', 'book', book['Book ID'], `Updated "${book.Title}"`)
    return { book: mapBook(book) }
  },

  'books.archive': (auth, { payload }) => {
    requireRole(auth, ['ADMIN', 'LIBRARIAN'])
    const book = findById(db.books, 'Book ID', String(payload.bookId))
    if (!book) fail('NOT_FOUND', 'That book does not exist.')
    book.Status = payload.archived === false ? 'ACTIVE' : 'ARCHIVED'
    book['Updated at'] = nowISO()
    logActivity(userId(auth.user), book.Status === 'ARCHIVED' ? 'book.archived' : 'book.restored', 'book', book['Book ID'], `${book.Status === 'ARCHIVED' ? 'Archived' : 'Restored'} "${book.Title}"`)
    return { book: mapBook(book) }
  },

  'books.delete': (auth, { payload }) => {
    requireRole(auth, ['ADMIN'])
    const bookId = String(payload.bookId || '')
    const book = findById(db.books, 'Book ID', bookId)
    if (!book) fail('NOT_FOUND', 'That book does not exist.')
    const loans = db.loans.filter((loan) => String(loan['Book ID']) === bookId)
    if (loans.length) {
      fail(
        'CONFLICT',
        `This title has circulation history (${loans.length} loan record(s)), so it cannot be deleted. Archive it instead to keep the records consistent.`,
      )
    }
    const openReservations = db.reservations.filter(
      (res) =>
        String(res['Book ID']) === bookId &&
        ['PENDING', 'READY'].includes(String(res['Reservation status'] || '').toUpperCase()),
    )
    if (openReservations.length) {
      fail('CONFLICT', `This title still has ${openReservations.length} open reservation(s). Cancel them before deleting.`)
    }
    db.books = db.books.filter((row) => String(row['Book ID']) !== bookId)
    logActivity(userId(auth.user), 'book.deleted', 'book', bookId, `Deleted "${book.Title}" (no circulation history)`)
    return { deleted: true, bookId }
  },

  'system.diagnostics': (auth) => {
    requireRole(auth, ['ADMIN'])
    const tables = {
      books: { ok: true, tab: 'Books', rows: db.books.length },
      users: { ok: true, tab: 'Users', rows: db.users.length },
      loans: { ok: true, tab: 'Loans', rows: db.loans.length },
      reservations: { ok: true, tab: 'Reservations', rows: db.reservations.length },
      activity: { ok: true, tab: 'ActivityLogs', rows: db.activity.length },
      settings: { ok: true, tab: 'Settings', rows: Object.keys(db.settings).length },
      sessions: { ok: true, tab: 'Sessions', rows: db.sessions.length },
      wishlists: { ok: true, tab: 'Wishlists', rows: db.wishlists.length },
    }
    return {
      service: 'lumina-library-api',
      version: '2.1.0-mock',
      spreadsheet: 'mock',
      user: String(auth.user.Email),
      role: roleOf(auth.user.Role),
      timezone: 'Asia/Kolkata',
      tables,
      settings: { ...db.settings },
      time: nowISO(),
    }
  },

  'users.list': (auth) => {
    requireRole(auth, ['ADMIN', 'LIBRARIAN'])
    return {
      users: db.users.map((u) => ({
        ...publicUser(u),
        activeLoans: db.loans.filter((l) => l['User ID'] === userId(u) && l['Loan status'] === 'ACTIVE').length,
        activeHolds: db.reservations.filter((r) => r['User ID'] === userId(u) && ['PENDING', 'READY'].includes(r['Reservation status'])).length,
        outstandingFine: unpaidFines(userId(u)),
      })),
    }
  },

  'users.create': (auth, { payload }) => {
    requireRole(auth, ['ADMIN', 'LIBRARIAN'])
    const email = sanitizeText(payload.email, 200).toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('VALIDATION_ERROR', 'Enter a valid email address.')
    if (db.users.some((u) => String(u.Email).toLowerCase() === email)) fail('CONFLICT', 'That email is already registered.')
    const institutionalId = sanitizeText(payload.institutionalId, 40)
    if (db.users.some((u) => String(u['Institutional ID']).toLowerCase() === institutionalId.toLowerCase())) {
      fail('CONFLICT', 'That institutional ID is already registered.')
    }
    const password = String(payload.password || '')
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      fail('VALIDATION_ERROR', 'Password must be at least 8 characters and contain a letter and a number.')
    }
    const role = roleOf(payload.role)
    assertAssignableRole(auth, role)
    const salt = newSalt()
    const user = {
      'User ID': nextId('U', db.users, 'User ID'),
      Name: sanitizeText(payload.name, 120),
      Email: email,
      'Institutional ID': institutionalId,
      Role: role,
      Department: sanitizeText(payload.department, 120),
      'Account status': String(payload.accountStatus || 'ACTIVE').toUpperCase(),
      'Password salt': salt,
      'Password hash': hashPassword(password, salt, HASH_ROUNDS),
      'Hash iterations': HASH_ROUNDS,
      Phone: sanitizeText(payload.phone, 30),
      'Borrowing limit': payload.borrowingLimit === '' || payload.borrowingLimit === undefined ? '' : Number(payload.borrowingLimit),
      'Created at': nowISO(),
      'Updated at': nowISO(),
    }
    db.users.push(user)
    logActivity(userId(auth.user), 'user.created', 'user', user['User ID'], `Created ${role} account for ${user.Name}`)
    return { user: publicUser(user) }
  },

  'users.update': (auth, { payload }) => {
    requireRole(auth, ['ADMIN', 'LIBRARIAN'])
    const user = findById(db.users, 'User ID', String(payload.userId))
    if (!user) fail('NOT_FOUND', 'That account does not exist.')
    assertCanManageTarget(auth, user)
    assertAssignableRole(auth, roleOf(payload.role))
    const email = sanitizeText(payload.email, 200).toLowerCase()
    if (db.users.some((u) => u !== user && String(u.Email).toLowerCase() === email)) fail('CONFLICT', 'That email is already registered.')
    Object.assign(user, {
      Name: sanitizeText(payload.name, 120) || user.Name,
      Email: email || user.Email,
      'Institutional ID': sanitizeText(payload.institutionalId, 40) || user['Institutional ID'],
      Role: roleOf(payload.role),
      Department: sanitizeText(payload.department, 120),
      Phone: sanitizeText(payload.phone, 30),
      'Updated at': nowISO(),
    })
    if (payload.password) {
      const salt = newSalt()
      user['Password salt'] = salt
      user['Password hash'] = hashPassword(String(payload.password), salt, HASH_ROUNDS)
    }
    logActivity(userId(auth.user), 'user.updated', 'user', user['User ID'], `Updated ${user.Name}`)
    return { user: publicUser(user) }
  },

  'users.setStatus': (auth, { payload }) => {
    requireRole(auth, ['ADMIN', 'LIBRARIAN'])
    const user = findById(db.users, 'User ID', String(payload.userId))
    if (!user) fail('NOT_FOUND', 'That account does not exist.')
    assertCanManageTarget(auth, user)
    const status = String(payload.accountStatus || '').toUpperCase()
    if (!['ACTIVE', 'INACTIVE'].includes(status)) fail('VALIDATION_ERROR', 'Account status must be ACTIVE or INACTIVE.')
    if (user['User ID'] === userId(auth.user) && status === 'INACTIVE') {
      fail('CONFLICT', 'You cannot deactivate your own account.')
    }
    user['Account status'] = status
    user['Updated at'] = nowISO()
    if (status === 'INACTIVE') {
      for (const [token, record] of db.sessions) if (record.userId === user['User ID']) record.revoked = true
    }
    logActivity(userId(auth.user), 'user.status', 'user', user['User ID'], `${status === 'ACTIVE' ? 'Activated' : 'Deactivated'} ${user.Name}`)
    return { user: publicUser(user) }
  },

  'users.resetPassword': (auth, { payload }) => {
    requireRole(auth, ['ADMIN', 'LIBRARIAN'])
    const user = findById(db.users, 'User ID', String(payload.userId))
    if (!user) fail('NOT_FOUND', 'That account does not exist.')
    assertCanManageTarget(auth, user)
    const next = String(payload.newPassword || '')
    if (next.length < 8) fail('VALIDATION_ERROR', 'Password must be at least 8 characters.')
    const salt = newSalt()
    user['Password salt'] = salt
    user['Password hash'] = hashPassword(next, salt, HASH_ROUNDS)
    logActivity(userId(auth.user), 'user.password_reset', 'user', user['User ID'], `Reset password for ${user.Name}`)
    return { reset: true }
  },

  'users.updateProfile': (auth, { payload }) => {
    Object.assign(auth.user, {
      Name: sanitizeText(payload.name, 120) || auth.user.Name,
      Phone: sanitizeText(payload.phone, 30),
      Department: sanitizeText(payload.department, 120),
      'Updated at': nowISO(),
    })
    logActivity(userId(auth.user), 'user.profile', 'user', userId(auth.user), 'Updated own profile')
    return { user: publicUser(auth.user) }
  },

  'loans.list': (auth, { payload }) => {
    const staff = isStaff(roleOf(auth.user.Role))
    let rows = db.loans.filter((l) => staff || l['User ID'] === userId(auth.user))
    const status = String(payload?.status || '').toUpperCase()
    if (status && status !== 'ALL') rows = rows.filter((l) => String(l['Loan status']).toUpperCase() === status)
    return { loans: rows.map(mapLoan), scope: staff ? 'ALL' : 'SELF' }
  },

  'loans.issue': (auth, { payload }) => {
    const role = roleOf(auth.user.Role)
    const me = userId(auth.user)
    const targetId = payload.userId ? String(payload.userId) : me
    if (!isStaff(role) && targetId !== me) fail('FORBIDDEN', 'You can only borrow books for your own account.')
    if (!isStaff(role) && String(db.settings.allow_self_checkout) !== 'true') {
      fail('FORBIDDEN', 'Self checkout is disabled. Ask library staff to issue this book.')
    }
    const book = findById(db.books, 'Book ID', String(payload.bookId))
    if (!book) fail('NOT_FOUND', 'That book does not exist.')
    const user = findById(db.users, 'User ID', targetId)
    if (!user) fail('NOT_FOUND', 'That member does not exist.')
    if (String(user['Account status']).toUpperCase() !== 'ACTIVE') fail('FORBIDDEN', 'This account is deactivated and cannot borrow.')
    if (String(book.Status).toUpperCase() === 'ARCHIVED') fail('CONFLICT', 'That title is archived and cannot be issued.')
    const availability = mapBook(book)
    if (availability.availableCopies < 1) fail('CONFLICT', 'No copies are available. Place a reservation instead.')
    const existing = db.loans.filter((l) => l['User ID'] === targetId && l['Loan status'] === 'ACTIVE')
    if (existing.some((l) => l['Book ID'] === book['Book ID'])) fail('CONFLICT', 'This member already has a copy of that title on loan.')
    const limit = borrowLimit(user)
    if (existing.length >= limit) fail('CONFLICT', `Borrowing limit reached (${limit} books). Return a book first.`)
    if (String(db.settings.block_issue_on_unpaid_fines) === 'true' && unpaidFines(targetId) >= settingNumber('fine_block_threshold')) {
      fail('CONFLICT', `Unpaid simulated fines block new loans.`)
    }
    const issuedAt = new Date()
    const loan = {
      'Loan ID': nextId('LN', db.loans, 'Loan ID'),
      'Book ID': book['Book ID'],
      'User ID': targetId,
      'Issued by': me,
      'Issue date': issuedAt.toISOString(),
      'Due date': addDays(issuedAt, settingNumber('loan_duration_days') || 14).toISOString(),
      'Return date': '',
      'Loan status': 'ACTIVE',
      'Renewal count': 0,
      'Fine amount': '',
      'Created at': issuedAt.toISOString(),
      'Updated at': issuedAt.toISOString(),
    }
    db.loans.push(loan)
    logActivity(me, 'loan.issued', 'loan', loan['Loan ID'], `Issued "${book.Title}" to ${user.Name}`)
    return { loan: mapLoan(loan) }
  },

  'loans.return': (auth, { payload }) => {
    requireRole(auth, ['ADMIN', 'LIBRARIAN'])
    const loan = findById(db.loans, 'Loan ID', String(payload.loanId))
    if (!loan) fail('NOT_FOUND', 'That loan does not exist.')
    if (loan['Loan status'] === 'RETURNED') fail('CONFLICT', 'This loan was already returned.')
    const daysLate = overdueDays(loan['Due date'])
    const fine = daysLate * finePerDay()
    loan['Loan status'] = 'RETURNED'
    loan['Return date'] = nowISO()
    loan['Fine amount'] = fine
    loan['Updated at'] = nowISO()
    const book = findById(db.books, 'Book ID', loan['Book ID'])
    logActivity(userId(auth.user), 'loan.returned', 'loan', loan['Loan ID'], `Returned "${book?.Title || 'title'}"${fine ? ` with ₹${fine} simulated fine` : ''}`)
    return { loan: mapLoan(loan), fine, daysLate }
  },

  'loans.renew': (auth, { payload }) => {
    const role = roleOf(auth.user.Role)
    const loan = findById(db.loans, 'Loan ID', String(payload.loanId))
    if (!loan) fail('NOT_FOUND', 'That loan does not exist.')
    const owner = loan['User ID'] === userId(auth.user)
    if (!owner && !isStaff(role)) fail('FORBIDDEN', 'You can only renew your own loans.')
    if (loan['Loan status'] === 'RETURNED') fail('CONFLICT', 'A returned loan cannot be renewed.')
    if (overdueDays(loan['Due date']) > 0) fail('CONFLICT', 'Overdue loans cannot be renewed. Return the book first.')
    if ((Number(loan['Renewal count']) || 0) >= settingNumber('max_renewals')) {
      fail('CONFLICT', `Renewal limit reached (${settingNumber('max_renewals')}).`)
    }
    const waiting = db.reservations.filter((r) => r['Book ID'] === loan['Book ID'] && ['PENDING', 'READY'].includes(r['Reservation status']))
    if (waiting.length > 0) fail('CONFLICT', 'Another member is waiting for this title, so it cannot be renewed.')
    loan['Due date'] = addDays(new Date(loan['Due date']), settingNumber('renewal_extension_days') || 14).toISOString()
    loan['Renewal count'] = (Number(loan['Renewal count']) || 0) + 1
    loan['Updated at'] = nowISO()
    logActivity(userId(auth.user), 'loan.renewed', 'loan', loan['Loan ID'], 'Renewed a loan')
    return { loan: mapLoan(loan) }
  },

  'reservations.list': (auth) => {
    const staff = isStaff(roleOf(auth.user.Role))
    return {
      reservations: db.reservations.filter((r) => staff || r['User ID'] === userId(auth.user)).map(mapReservation),
      scope: staff ? 'ALL' : 'SELF',
    }
  },

  'reservations.create': (auth, { payload }) => {
    const role = roleOf(auth.user.Role)
    const me = userId(auth.user)
    const targetId = payload.userId ? String(payload.userId) : me
    if (!isStaff(role) && targetId !== me) fail('FORBIDDEN', 'You can only reserve books for your own account.')
    const book = findById(db.books, 'Book ID', String(payload.bookId))
    if (!book) fail('NOT_FOUND', 'That book does not exist.')
    if (String(book.Status).toUpperCase() === 'ARCHIVED') fail('CONFLICT', 'That title is archived and cannot be reserved.')
    const sameBook = db.reservations.filter((r) => r['Book ID'] === book['Book ID'] && ['PENDING', 'READY'].includes(r['Reservation status']))
    if (sameBook.some((r) => r['User ID'] === targetId)) fail('CONFLICT', 'You already have an active reservation for this title.')
    if (db.loans.some((l) => l['Book ID'] === book['Book ID'] && l['User ID'] === targetId && l['Loan status'] === 'ACTIVE')) {
      fail('CONFLICT', 'You already have this title on loan.')
    }
    const reservation = {
      'Reservation ID': nextId('RS', db.reservations, 'Reservation ID'),
      'Book ID': book['Book ID'],
      'User ID': targetId,
      'Reservation date': nowISO(),
      'Queue position': sameBook.length + 1,
      'Reservation status': 'PENDING',
      'Expiry date': '',
      'Created at': nowISO(),
      'Updated at': nowISO(),
    }
    db.reservations.push(reservation)
    logActivity(me, 'reservation.created', 'reservation', reservation['Reservation ID'], `Reserved "${book.Title}" (queue #${reservation['Queue position']})`)
    return { reservation: mapReservation(reservation) }
  },

  'reservations.cancel': (auth, { payload }) => {
    const role = roleOf(auth.user.Role)
    const reservation = findById(db.reservations, 'Reservation ID', String(payload.reservationId))
    if (!reservation) fail('NOT_FOUND', 'That reservation does not exist.')
    if (reservation['User ID'] !== userId(auth.user) && !isStaff(role)) fail('FORBIDDEN', 'You can only cancel your own reservations.')
    if (!['PENDING', 'READY'].includes(reservation['Reservation status'])) fail('CONFLICT', 'This reservation is already closed.')
    reservation['Reservation status'] = 'CANCELLED'
    reservation['Queue position'] = 0
    reservation['Updated at'] = nowISO()
    logActivity(userId(auth.user), 'reservation.cancelled', 'reservation', reservation['Reservation ID'], 'Cancelled a reservation')
    return { reservation: mapReservation(reservation) }
  },

  'settings.get': (auth) => ({ settings: { ...db.settings }, editable: roleOf(auth.user.Role) === 'ADMIN' }),

  'settings.update': (auth, { payload }) => {
    requireRole(auth, ['ADMIN'])
    const patch = payload.settings || {}
    const unknown = Object.keys(patch).filter((key) => !(key in DEFAULT_SETTINGS))
    if (unknown.length) fail('VALIDATION_ERROR', `Unknown setting(s): ${unknown.slice(0, 5).join(', ')}`)
    if (!Object.keys(patch).length) fail('VALIDATION_ERROR', 'No settings were supplied.')
    Object.keys(patch).forEach((key) => {
      db.settings[key] = sanitizeText(patch[key], 120)
    })
    logActivity(userId(auth.user), 'settings.updated', 'settings', 'library', 'Updated library policy')
    return { settings: { ...db.settings } }
  },

  'reports.dashboard': (auth) => dashboard(auth),

  'reports.analytics': (auth, { payload }) => {
    const staff = isStaff(roleOf(auth.user.Role))
    const from = payload?.from ? new Date(payload.from) : addDays(new Date(), -180)
    const to = payload?.to ? new Date(payload.to) : new Date()
    const scoped = db.loans.filter((loan) => {
      if (!staff && loan['User ID'] !== userId(auth.user)) return false
      const issued = new Date(loan['Issue date'])
      return issued >= from && issued <= to
    })
    const byMonth = {}
    const byCategory = {}
    const counts = {}
    scoped.forEach((loan) => {
      const issued = new Date(loan['Issue date'])
      const key = `${issued.getUTCFullYear()}-${String(issued.getUTCMonth() + 1).padStart(2, '0')}`
      byMonth[key] = byMonth[key] || { month: key, issued: 0, returned: 0 }
      byMonth[key].issued += 1
      if (loan['Loan status'] === 'RETURNED') byMonth[key].returned += 1
      const book = findById(db.books, 'Book ID', loan['Book ID'])
      const category = book?.Category || 'General'
      byCategory[category] = (byCategory[category] || 0) + 1
      counts[loan['Book ID']] = (counts[loan['Book ID']] || 0) + 1
    })
    return {
      scope: staff ? 'LIBRARY' : 'SELF',
      range: { from: from.toISOString(), to: to.toISOString() },
      issued: scoped.length,
      returned: scoped.filter((l) => l['Loan status'] === 'RETURNED').length,
      series: Object.keys(byMonth).sort().map((k) => byMonth[k]),
      categories: Object.entries(byCategory).map(([category, loans]) => ({ category, loans })).sort((a, b) => b.loans - a.loans),
      topBooks: Object.entries(counts)
        .map(([bookId, loans]) => {
          const book = findById(db.books, 'Book ID', bookId)
          return { bookId, title: book?.Title || bookId, author: book?.Author || '', loans }
        })
        .sort((a, b) => b.loans - a.loans)
        .slice(0, 8),
    }
  },

  'activity.list': (auth, { payload }) => {
    const staff = isStaff(roleOf(auth.user.Role))
    const limit = Math.min(Math.max(Number(payload?.limit) || 40, 1), 200)
    return {
      activity: db.activity
        .filter((a) => staff || a['Actor user ID'] === userId(auth.user))
        .slice(0, limit)
        .map((a) => ({
          activityId: a['Activity ID'],
          actorUserId: a['Actor user ID'],
          action: a.Action,
          entityType: a['Entity type'],
          entityId: a['Entity ID'],
          timestamp: a.Timestamp,
          summary: a.Summary,
        })),
    }
  },

  'wishlist.list': (auth) => ({
    wishlist: db.wishlists.filter((w) => w['User ID'] === userId(auth.user)).map((w) => ({ bookId: w['Book ID'], createdAt: w['Created at'] })),
  }),

  'wishlist.toggle': (auth, { payload }) => {
    const bookId = String(payload.bookId)
    if (!findById(db.books, 'Book ID', bookId)) fail('NOT_FOUND', 'That book does not exist.')
    const index = db.wishlists.findIndex((w) => w['User ID'] === userId(auth.user) && w['Book ID'] === bookId)
    if (index >= 0) {
      db.wishlists.splice(index, 1)
      return { bookId, saved: false }
    }
    db.wishlists.push({ 'User ID': userId(auth.user), 'Book ID': bookId, 'Created at': nowISO() })
    return { bookId, saved: true }
  },

  /* test-only helpers, mirroring direct spreadsheet edits */
  '__test.sheetEdit': (auth, { payload }) => {
    requireRole(auth, ['ADMIN'])
    const book = findById(db.books, 'Book ID', String(payload.bookId))
    if (!book) fail('NOT_FOUND', 'That book does not exist.')
    if (payload.title) book.Title = String(payload.title)
    if (payload.totalCopies) book['Total copies'] = Number(payload.totalCopies)
    book['Updated at'] = nowISO()
    return { book: mapBook(book) }
  },
  '__test.addSheetRow': (auth, { payload }) => {
    requireRole(auth, ['ADMIN'])
    const book = {
      'Book ID': payload.bookId || nextId('BK', db.books, 'Book ID'),
      Title: payload.title,
      Author: payload.author || 'Sheet Author',
      ISBN: payload.isbn || '',
      Publisher: '',
      Year: 2026,
      Category: payload.category || 'General',
      Shelf: 'SHEET-01',
      'Total copies': Number(payload.totalCopies) || 1,
      Status: 'ACTIVE',
      Added: nowISO(),
      Description: '',
      'Created at': nowISO(),
      'Updated at': nowISO(),
    }
    db.books.push(book)
    return { book: mapBook(book) }
  },
  '__test.reset': () => {
    seed()
    return { reset: true }
  },
  '__test.state': () => ({
    users: db.users.map((u) => ({ id: u['User ID'], email: u.Email, role: u.Role, status: u['Account status'] })),
    books: db.books.length,
    loans: db.loans.length,
    sessions: db.sessions.size,
    activity: db.activity.length,
  }),
}

/* ----------------------------------------------------------------- server */
const server = http.createServer((request, response) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors)
    response.end()
    return
  }

  const url = new URL(request.url, 'http://localhost')
  const send = (payload) => {
    response.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
    response.end(JSON.stringify(payload))
  }

  if (request.method === 'GET') {
    if (url.pathname === '/health' || url.searchParams.get('action') === 'health') {
      send({ ok: true, data: actions.health() })
      return
    }
    send({ ok: false, error: { code: 'UNKNOWN_ACTION', message: 'Use POST for API actions.' } })
    return
  }

  let raw = ''
  request.on('data', (chunk) => {
    raw += chunk
  })
  request.on('end', () => {
    let body = {}
    try {
      body = JSON.parse(raw || '{}')
    } catch {
      send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON.' } })
      return
    }
    const entry = actions[body.action]
    if (!entry) {
      send({ ok: false, error: { code: 'UNKNOWN_ACTION', message: `Unknown action: ${sanitizeText(body.action, 60)}` } })
      return
    }
    try {
      const isPublic = body.action === 'health' || body.action === 'auth.login' || body.action === '__test.reset'
      const auth = isPublic ? { user: null, token: null } : session(body.token)
      const data = entry(auth, { payload: body.payload || {}, body })
      send({ ok: true, data })
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'SERVER_ERROR'
      const message = code === 'SERVER_ERROR' ? 'The server could not complete that request. Please retry.' : error.message
      if (code === 'SERVER_ERROR') console.error('[mock-backend]', error)
      send({ ok: false, error: { code, message } })
    }
  })
})

seed()
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Lumina mock backend on http://localhost:${PORT} (POST JSON { action, token, payload })`)
  console.log('accounts: admin@lumina.edu / Lumina@2026 · faculty@lumina.edu / Faculty@2026 · student@lumina.edu / Student@2026')
})
