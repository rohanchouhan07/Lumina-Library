/**
 * gas-harness.mjs — run the real Apps Script backend source in Node.
 *
 * The backend in google-sheets/backend/ is plain V8 JavaScript; only the Google
 * globals (SpreadsheetApp, Utilities, PropertiesService, …) are missing. This
 * module fakes exactly those, backed by an in-memory spreadsheet, and loads the
 * .gs files into one VM context.
 *
 * That means the suites built on top of it exercise the actual shipped code —
 * header matching, locking, validation, hashing, role checks — not a rewrite.
 * It is NOT a substitute for deploying: it does not prove Google's runtime,
 * OAuth scopes or Web-app routing. It proves the logic.
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = path.resolve(here, '../lumina-library/google-sheets/backend')

/* ------------------------------------------------------------- sheet fakes */

const SIGNED = (buffer) => Array.from(buffer).map((byte) => (byte > 127 ? byte - 256 : byte))

class FakeRange {
  constructor(sheet, row, column, numRows = 1, numColumns = 1) {
    this.sheet = sheet
    this.row = row
    this.column = column
    this.numRows = numRows
    this.numColumns = numColumns
  }
  getValues() {
    const out = []
    for (let r = 0; r < this.numRows; r += 1) {
      const row = []
      for (let c = 0; c < this.numColumns; c += 1) {
        row.push(this.sheet.cell(this.row + r, this.column + c))
      }
      out.push(row)
    }
    return out
  }
  getValue() {
    return this.sheet.cell(this.row, this.column)
  }
  setValues(values) {
    values.forEach((row, r) => {
      row.forEach((value, c) => {
        this.sheet.setCell(this.row + r, this.column + c, value)
      })
    })
    return this
  }
  setValue(value) {
    this.sheet.setCell(this.row, this.column, value)
    return this
  }
  setFontWeight() {
    return this
  }
  setNumberFormat() {
    return this
  }
}

class FakeSheet {
  constructor(name, data = []) {
    this.name = name
    this.data = data.map((row) => row.slice())
    this.frozen = 0
  }
  getName() {
    return this.name
  }
  setName(name) {
    this.name = name
    return this
  }
  getLastRow() {
    let last = 0
    this.data.forEach((row, index) => {
      if (row.some((cell) => String(cell).trim() !== '')) last = index + 1
    })
    return last
  }
  getLastColumn() {
    let last = 0
    this.data.forEach((row) => {
      row.forEach((cell, index) => {
        if (String(cell).trim() !== '') last = Math.max(last, index + 1)
      })
    })
    return last
  }
  getRange(row, column, numRows = 1, numColumns = 1) {
    return new FakeRange(this, row, column, numRows, numColumns)
  }
  cell(row, column) {
    const line = this.data[row - 1]
    if (!line) return ''
    const value = line[column - 1]
    return value === undefined ? '' : value
  }
  setCell(row, column, value) {
    while (this.data.length < row) this.data.push([])
    const line = this.data[row - 1]
    while (line.length < column) line.push('')
    line[column - 1] = value
  }
  appendRow(values) {
    this.data.push(values.slice())
    return this.data.length
  }
  deleteRow(row) {
    this.data.splice(row - 1, 1)
  }
  setFrozenRows(count) {
    this.frozen = count
    return this
  }
  clear() {
    this.data = []
  }
  /** Test helper: rows as arrays, trimmed of trailing blanks. */
  grid() {
    return this.data.map((row) => row.slice())
  }
}

class FakeSpreadsheet {
  constructor(name, id, sheets) {
    this.name = name
    this.id = id
    this.sheets = sheets
  }
  getId() {
    return this.id
  }
  getName() {
    return this.name
  }
  getSpreadsheetTimeZone() {
    return 'Asia/Kolkata'
  }
  getSheets() {
    return this.sheets.slice()
  }
  getSheetByName(name) {
    return this.sheets.find((sheet) => sheet.getName() === name) || null
  }
  insertSheet(name) {
    const sheet = new FakeSheet(name)
    this.sheets.push(sheet)
    return sheet
  }
  deleteSheet(sheet) {
    this.sheets = this.sheets.filter((item) => item !== sheet)
  }
}

/* ----------------------------------------------------------------- harness */

/**
 * Build a harness around a fake workbook.
 *
 * @param {object} options
 * @param {Array<{name: string, rows?: any[][]}>} options.sheets  initial tabs
 * @param {Record<string,string>} options.properties  script properties
 * @param {string} [options.email]  the account the script runs as
 */
export function createHarness({ sheets = [], properties = {}, email = 'owner@example.com' } = {}) {
  const spreadsheet = new FakeSpreadsheet(
    'Lumina Library (harness)',
    properties.SPREADSHEET_ID || '18CGNA07OgL0TAH4mCVKz94AwQGx_Jc1jA2b_e-TfL3s',
    sheets.map((sheet) => new FakeSheet(sheet.name, sheet.rows || [])),
  )
  const props = new Map(Object.entries(properties))
  const logs = []

  const sandbox = {
    console: {
      log: (...args) => logs.push(['log', args.join(' ')]),
      error: (...args) => logs.push(['error', args.join(' ')]),
      warn: (...args) => logs.push(['warn', args.join(' ')]),
      info: (...args) => logs.push(['info', args.join(' ')]),
    },
    SpreadsheetApp: {
      openById: (id) => {
        if (id !== spreadsheet.getId()) throw new Error(`Unexpected spreadsheet id: ${id}`)
        return spreadsheet
      },
      getActiveSpreadsheet: () => spreadsheet,
      flush: () => {},
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => (props.has(key) ? props.get(key) : null),
        setProperty: (key, value) => props.set(key, String(value)),
        deleteProperty: (key) => props.delete(key),
        getProperties: () => Object.fromEntries(props),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => true,
        tryLock: () => true,
        releaseLock: () => {},
        hasLock: () => true,
      }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      Charset: { UTF_8: 'UTF-8' },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_algorithm, value) => SIGNED(crypto.createHash('sha256').update(String(value), 'utf8').digest()),
      computeHmacSha256Signature: (value, key) =>
        SIGNED(crypto.createHmac('sha256', String(key)).update(String(value), 'utf8').digest()),
      base64Encode: (value) => Buffer.from(String(value), 'utf8').toString('base64'),
      sleep: () => {},
    },
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (content) => {
        const output = {
          content,
          mimeType: null,
          getContent: () => output.content,
          setMimeType(mime) {
            output.mimeType = mime
            return output
          },
        }
        return output
      },
    },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => email }),
      getActiveUser: () => ({ getEmail: () => email }),
      getScriptTimeZone: () => 'Asia/Kolkata',
    },
    UrlFetchApp: {
      fetch: () => {
        throw new Error('UrlFetchApp is not available in the harness')
      },
    },
    CacheService: {
      getScriptCache: () => ({
        get: () => null,
        put: () => {},
        remove: () => {},
      }),
    },
  }

  vm.createContext(sandbox)
  // Apps Script hoists function declarations across files; one combined script
  // reproduces that exactly. Order matches google-sheets/build-bundle.mjs.
  const ORDER = [
    'Config.gs',
    'Validation.gs',
    'SheetDb.gs',
    'AuthService.gs',
    'MembersService.gs',
    'SettingsService.gs',
    'BooksService.gs',
    'LoansService.gs',
    'ReservationsService.gs',
    'WishlistService.gs',
    'ReportsService.gs',
    'Setup.gs',
    'Code.gs',
  ]
  const present = fs.readdirSync(BACKEND_DIR).filter((file) => file.endsWith('.gs'))
  const unknown = present.filter((file) => !ORDER.includes(file))
  if (unknown.length) throw new Error(`Unordered backend files: ${unknown.join(', ')}`)
  const combined = ORDER.map((file) => {
    const source = fs.readFileSync(path.join(BACKEND_DIR, file), 'utf8')
    return `\n// ---- ${file} ----\n${source}\n//# sourceURL=${file}\n`
  }).join('\n')
  vm.runInContext(combined, sandbox, { filename: 'lumina-backend.gs' })

  /** POST an API action exactly as the Web app would receive it. */
  const post = (action, payload = {}, token = null) => {
    const event = {
      parameter: {},
      postData: {
        contents: JSON.stringify({ action, payload, token }),
        type: 'text/plain',
      },
    }
    const output = sandbox.doPost(event)
    return JSON.parse(output.getContent())
  }

  /** GET probe as the Web app would receive it. */
  const get = (params = {}) => {
    const output = sandbox.doGet({ parameter: params })
    return JSON.parse(output.getContent())
  }

  return {
    sandbox,
    spreadsheet,
    props,
    logs,
    post,
    get,
    sheet: (name) => {
      const sheet = spreadsheet.getSheetByName(name)
      if (!sheet) throw new Error(`No tab named ${name}`)
      return sheet
    },
    tabNames: () => spreadsheet.getSheets().map((sheet) => sheet.getName()),
  }
}

/** The 13 catalogue headers the existing spreadsheet really has. */
export const LEGACY_BOOK_HEADERS = [
  'Book ID',
  'Title',
  'Author',
  'ISBN',
  'Publisher',
  'Year',
  'Category',
  'Shelf',
  'Total copies',
  'Copies on loan',
  'Available copies',
  'Status',
  'Added',
]

/** The one placeholder row that exists in the live sheet today. */
export const LEGACY_BOOK_ROW = ['BK101', 'rohan ', 'rohan', '', '', '', '', '', '', '', '', '', '']
