import {
  addDays,
  differenceInCalendarDays,
  eachMonthOfInterval,
  endOfDay,
  format,
  formatDistanceToNowStrict,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns'

export const ISO = "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"

export function now(): Date {
  return new Date()
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function startOfToday(): Date {
  return startOfDay(new Date())
}

/** ISO string for `days` from today (negative goes to the past). */
export function isoDaysFromNow(days: number, hour = 10, minute = 0): string {
  const date = addDays(new Date(), days)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

export function isoMonthsAgo(months: number, day = 8): string {
  const date = startOfMonth(subMonths(new Date(), months))
  date.setDate(Math.min(day, 28))
  date.setHours(11, 0, 0, 0)
  return date.toISOString()
}

export function addDaysISO(iso: string, days: number): string {
  return addDays(parseISO(iso), days).toISOString()
}

export function formatDate(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!iso) return '—'
  const date = parseISO(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return format(date, pattern)
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatDate(iso, 'd MMM yyyy, h:mm a')
}

export function formatMonth(iso: string): string {
  return formatDate(iso, 'MMM')
}

export function formatMonthLong(iso: string): string {
  return formatDate(iso, 'MMM yyyy')
}

export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = parseISO(iso)
  if (Number.isNaN(date.getTime())) return ''
  return format(date, 'yyyy-MM-dd')
}

export function fromDateInputValue(value: string): string {
  const date = new Date(`${value}T10:00:00`)
  return Number.isNaN(date.getTime()) ? nowISO() : date.toISOString()
}

/** Whole days from `a` to `b`, calendar-based (negative if b is before a). */
export function daysBetween(a: string | Date, b: string | Date): number {
  const from = typeof a === 'string' ? parseISO(a) : a
  const to = typeof b === 'string' ? parseISO(b) : b
  return differenceInCalendarDays(to, from)
}

/** Days late relative to today; 0 when not overdue. */
export function overdueDays(dueAt: string, at: Date = new Date()): number {
  const diff = differenceInCalendarDays(startOfDay(at), startOfDay(parseISO(dueAt)))
  return diff > 0 ? diff : 0
}

export function overdueDaysAt(dueAt: string, returnedAt: string): number {
  const diff = differenceInCalendarDays(startOfDay(parseISO(returnedAt)), startOfDay(parseISO(dueAt)))
  return diff > 0 ? diff : 0
}

export function daysUntil(iso: string, at: Date = new Date()): number {
  return differenceInCalendarDays(startOfDay(parseISO(iso)), startOfDay(at))
}

export function isDueSoon(dueAt: string, withinDays = 3): boolean {
  const days = daysUntil(dueAt)
  return days >= 0 && days <= withinDays
}

export function isPastDue(dueAt: string, at: Date = new Date()): boolean {
  return isBefore(endOfDay(parseISO(dueAt)), startOfDay(at))
}

export function isToday(iso: string): boolean {
  return isSameDay(parseISO(iso), new Date())
}

export function isAfterNow(iso: string | null): boolean {
  if (!iso) return false
  return isAfter(parseISO(iso), new Date())
}

export function relativeTime(iso: string): string {
  const date = parseISO(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${formatDistanceToNowStrict(date, { addSuffix: true })}`
}

export function dueLabel(dueAt: string): { text: string; tone: 'ok' | 'soon' | 'overdue' } {
  const days = daysUntil(dueAt)
  if (days < 0) {
    const late = Math.abs(days)
    return { text: `${late} ${late === 1 ? 'day' : 'days'} overdue`, tone: 'overdue' }
  }
  if (days === 0) return { text: 'Due today', tone: 'soon' }
  if (days === 1) return { text: 'Due tomorrow', tone: 'soon' }
  if (days <= 3) return { text: `Due in ${days} days`, tone: 'soon' }
  return { text: `Due ${formatDate(dueAt, 'd MMM')}`, tone: 'ok' }
}

/** Last `count` months as ISO month-start strings, oldest first, including current. */
export function lastMonths(count: number): Date[] {
  const end = new Date()
  const start = startOfMonth(subMonths(end, count - 1))
  return eachMonthOfInterval({ start, end })
}

export function monthKey(iso: string | Date): string {
  const date = typeof iso === 'string' ? parseISO(iso) : iso
  return format(date, 'yyyy-MM')
}

export function formatMonthKey(key: string): string {
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return format(date, 'MMM')
}

export function formatMonthKeyLong(key: string): string {
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return format(date, 'MMM yyyy')
}
