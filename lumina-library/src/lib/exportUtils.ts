import type { Book, LibraryData, Loan, Member } from '@/types'
import { getAvailability, loanFine } from '@/features/library/engine'
import { formatDate } from './dateUtils'

export interface CsvColumn<T> {
  key: string
  label: string
  value: (row: T) => string | number | null | undefined
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCell(column.label)).join(',')
  const body = rows.map((row) => columns.map((column) => escapeCell(column.value(row))).join(','))
  return [header, ...body].join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function stamp() {
  return new Date().toISOString().slice(0, 10)
}

export function exportBooksCsv(books: Book[], data: LibraryData, filters = 'all'): void {
  const columns: CsvColumn<Book>[] = [
    { key: 'id', label: 'Book ID', value: (book) => book.id },
    { key: 'title', label: 'Title', value: (book) => book.title },
    { key: 'author', label: 'Author', value: (book) => book.author },
    { key: 'isbn', label: 'ISBN', value: (book) => book.isbn },
    { key: 'publisher', label: 'Publisher', value: (book) => book.publisher },
    { key: 'year', label: 'Year', value: (book) => book.year },
    { key: 'category', label: 'Category', value: (book) => book.category },
    { key: 'shelf', label: 'Shelf', value: (book) => book.shelf },
    { key: 'total', label: 'Total copies', value: (book) => book.totalCopies },
    { key: 'onLoan', label: 'Copies on loan', value: (book) => getAvailability(book, data).onLoan },
    { key: 'available', label: 'Available copies', value: (book) => getAvailability(book, data).available },
    { key: 'status', label: 'Status', value: (book) => book.status },
    { key: 'added', label: 'Added', value: (book) => formatDate(book.addedAt) },
  ]
  downloadCsv(`lumina-books-${filters}-${stamp()}.csv`, toCsv(books, columns))
}

export function exportMembersCsv(members: Member[], data: LibraryData): void {
  const columns: CsvColumn<Member>[] = [
    { key: 'id', label: 'Member ID', value: (member) => member.id },
    { key: 'name', label: 'Name', value: (member) => member.name },
    { key: 'email', label: 'Email', value: (member) => member.email },
    { key: 'department', label: 'Department', value: (member) => member.department },
    { key: 'role', label: 'Role', value: (member) => member.role },
    { key: 'status', label: 'Status', value: (member) => member.status },
    {
      key: 'activeLoans',
      label: 'Active loans',
      value: (member) =>
        data.loans.filter((loan) => loan.memberId === member.id && loan.status === 'active').length,
    },
    {
      key: 'reservations',
      label: 'Active reservations',
      value: (member) =>
        data.reservations.filter(
          (reservation) =>
            reservation.memberId === member.id &&
            (reservation.status === 'pending' || reservation.status === 'ready'),
        ).length,
    },
    { key: 'joined', label: 'Registered', value: (member) => formatDate(member.joinedAt) },
  ]
  downloadCsv(`lumina-members-${stamp()}.csv`, toCsv(members, columns))
}

export function exportLoansCsv(loans: Loan[], data: LibraryData): void {
  const columns: CsvColumn<Loan>[] = [
    { key: 'id', label: 'Loan ID', value: (loan) => loan.id },
    { key: 'book', label: 'Book', value: (loan) => data.books.find((b) => b.id === loan.bookId)?.title ?? loan.bookId },
    { key: 'bookId', label: 'Book ID', value: (loan) => loan.bookId },
    { key: 'member', label: 'Member', value: (loan) => data.members.find((m) => m.id === loan.memberId)?.name ?? loan.memberId },
    { key: 'memberId', label: 'Member ID', value: (loan) => loan.memberId },
    { key: 'issued', label: 'Issued', value: (loan) => formatDate(loan.issuedAt) },
    { key: 'due', label: 'Due', value: (loan) => formatDate(loan.dueAt) },
    { key: 'returned', label: 'Returned', value: (loan) => (loan.returnedAt ? formatDate(loan.returnedAt) : '') },
    { key: 'status', label: 'Status', value: (loan) => loan.status },
    { key: 'renewals', label: 'Renewals', value: (loan) => loan.renewals },
    { key: 'fine', label: 'Demo fine (INR)', value: (loan) => loanFine(loan, data.config) },
  ]
  downloadCsv(`lumina-circulation-${stamp()}.csv`, toCsv(loans, columns))
}

export function exportReservationsCsv(data: LibraryData): void {
  const columns: CsvColumn<(typeof data.reservations)[number]>[] = [
    { key: 'id', label: 'Reservation ID', value: (r) => r.id },
    { key: 'book', label: 'Book', value: (r) => data.books.find((b) => b.id === r.bookId)?.title ?? r.bookId },
    { key: 'member', label: 'Member', value: (r) => data.members.find((m) => m.id === r.memberId)?.name ?? r.memberId },
    { key: 'created', label: 'Placed', value: (r) => formatDate(r.createdAt) },
    { key: 'status', label: 'Status', value: (r) => r.status },
    { key: 'ready', label: 'Ready', value: (r) => (r.readyAt ? formatDate(r.readyAt) : '') },
    { key: 'expires', label: 'Hold expires', value: (r) => (r.expiresAt ? formatDate(r.expiresAt) : '') },
  ]
  downloadCsv(`lumina-reservations-${stamp()}.csv`, toCsv(data.reservations, columns))
}
