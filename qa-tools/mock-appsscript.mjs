/**
 * Local stand-in for the Google Apps Script bridge (google-sheets/Code.gs).
 * Implements the same wire contract so the website's write path can be tested
 * end to end without deploying anything:
 *
 *   GET  /sheet.csv        → current sheet state as CSV (what gviz/tq returns)
 *   POST /exec             → { action: 'upsert' | 'derived' | 'archive' | 'ping', rows }
 *   POST /test/row         → { values: [...] } append a row as a "human edit"
 *   POST /test/reset       → back to the header-only state
 *   GET  /state            → JSON dump for assertions
 */
import http from 'node:http'

const HEADER = [
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

let sheet = { header: [...HEADER], rows: [] }
const log = []

const escapeCell = (value) => {
  const text = value === undefined || value === null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n'

function ensureHeaders(names) {
  names.forEach((name) => {
    if (!sheet.header.includes(name)) sheet.header.push(name)
  })
}

function idIndex() {
  return sheet.header.indexOf('Book ID')
}

function findRow(id) {
  const column = idIndex()
  return sheet.rows.findIndex((row) => String(row[column] ?? '').trim() === id)
}

function setCell(row, name, value) {
  const column = sheet.header.indexOf(name)
  if (column === -1) return
  while (row.length < sheet.header.length) row.push('')
  row[column] = value
}

function upsert(records) {
  ensureHeaders(['Description', 'Last edited from', 'Last edited at'])
  sheet.rows.forEach((row) => {
    while (row.length < sheet.header.length) row.push('')
  })
  const stamp = new Date().toISOString()
  let appended = 0
  let updated = 0
  records.forEach((record) => {
    const id = String(record['Book ID'] || '').trim()
    if (!id) return
    const index = findRow(id)
    if (index === -1) {
      const row = sheet.header.map((name) => {
        if (name === 'Last edited from') return 'Website'
        if (name === 'Last edited at') return stamp
        if (name === 'Added') return record.Added || stamp
        return record[name] !== undefined ? record[name] : ''
      })
      sheet.rows.push(row)
      appended += 1
      return
    }
    const row = sheet.rows[index]
    Object.keys(record).forEach((key) => {
      if (key === 'Last edited from' || key === 'Last edited at') return
      setCell(row, key, record[key])
    })
    setCell(row, 'Last edited from', 'Website')
    setCell(row, 'Last edited at', stamp)
    updated += 1
  })
  return { appended, updated }
}

function derived(records) {
  let updated = 0
  records.forEach((record) => {
    const index = findRow(String(record['Book ID'] || '').trim())
    if (index === -1) return
    const row = sheet.rows[index]
    setCell(row, 'Copies on loan', record['Copies on loan'])
    setCell(row, 'Available copies', record['Available copies'])
    setCell(row, 'Status', record.Status)
    updated += 1
  })
  return { updated }
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => resolve(raw))
  })
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost')
  const json = (status, payload) => {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    response.end(JSON.stringify(payload))
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    response.end()
    return
  }

  if (url.pathname === '/sheet.csv') {
    response.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    })
    response.end(toCsv(sheet.header, sheet.rows))
    return
  }

  if (url.pathname === '/state') {
    json(200, { header: sheet.header, rows: sheet.rows, log })
    return
  }

  if (url.pathname === '/exec' && request.method === 'POST') {
    const raw = await readBody(request)
    let body = {}
    try {
      body = JSON.parse(raw)
    } catch {
      json(400, { ok: false, error: 'Body was not valid JSON.' })
      return
    }
    log.push({
      at: new Date().toISOString(),
      action: body.action,
      count: body.rows?.length ?? 0,
      sample: (body.rows || []).slice(0, 3).map((r) => `${r['Book ID']}:${r.Title ?? r['Copies on loan'] ?? ''}`),
    })
    if (body.action === 'upsert') json(200, { ok: true, ...upsert(body.rows || []) })
    else if (body.action === 'derived') json(200, { ok: true, ...derived(body.rows || []) })
    else if (body.action === 'ping') json(200, { ok: true, action: 'ping', rows: sheet.rows.length })
    else json(200, { ok: false, error: `Unknown action: ${body.action}` })
    return
  }

  if (url.pathname === '/test/row' && request.method === 'POST') {
    const raw = await readBody(request)
    const { values = [] } = JSON.parse(raw || '{}')
    ensureHeaders(['Description', 'Last edited from', 'Last edited at'])
    sheet.rows.push(values)
    json(200, { ok: true, rows: sheet.rows.length })
    return
  }

  if (url.pathname === '/test/edit' && request.method === 'POST') {
    const raw = await readBody(request)
    const { id, field, value } = JSON.parse(raw || '{}')
    const index = findRow(String(id))
    if (index === -1) {
      json(404, { ok: false, error: 'row not found' })
      return
    }
    setCell(sheet.rows[index], field, value)
    json(200, { ok: true })
    return
  }

  if (url.pathname === '/test/reset' && request.method === 'POST') {
    sheet = { header: [...HEADER], rows: [] }
    log.length = 0
    json(200, { ok: true })
    return
  }

  json(404, { ok: false, error: 'not found' })
})

const PORT = Number(process.env.PORT || 8099)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`mock apps script + sheets bridge on http://localhost:${PORT}`)
  console.log(`  csv : http://localhost:${PORT}/sheet.csv`)
  console.log(`  post: http://localhost:${PORT}/exec`)
})
