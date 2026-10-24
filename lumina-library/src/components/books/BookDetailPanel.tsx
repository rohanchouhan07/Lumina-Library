import type { ReactNode } from 'react'
import { BookMarked, CalendarDays, Heart, LibraryBig, MapPin, Tag, Users } from 'lucide-react'
import type { Book } from '@/types'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { getAvailability } from '@/features/library/engine'
import { formatDate, relativeTime } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { Badge, StatusPill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Feedback'
import { InlineAlert } from '@/components/ui/Feedback'
import { BookCover } from './BookCover'
import { AvailabilityBadge, WishlistButton } from './BookCard'
import { Avatar } from '@/components/ui/Avatar'

export function BookDetailPanel({
  book,
  actions,
  compact = false,
}: {
  book: Book
  actions?: ReactNode
  compact?: boolean
}) {
  const { data, mode } = useLibrary()
  const { can } = useAuth()
  const availability = getAvailability(book, data)
  const history = data.loans
    .filter((loan) => loan.bookId === book.id)
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())

  const meta = [
    { icon: Tag, label: 'Category', value: book.category },
    { icon: LibraryBig, label: 'Publisher', value: book.publisher },
    { icon: CalendarDays, label: 'Published', value: String(book.year) },
    { icon: MapPin, label: 'Shelf', value: book.shelf },
    { icon: BookMarked, label: 'ISBN', value: book.isbn || '—' },
    { icon: CalendarDays, label: 'Added', value: formatDate(book.addedAt) },
  ]

  return (
    <div className={cn('space-y-5', compact && 'space-y-4')}>
      <div className="grid gap-5 sm:grid-cols-[150px_1fr]">
        <div className="mx-auto w-[140px] sm:mx-0 sm:w-full">
          <div className="overflow-hidden rounded-lg shadow-book">
            <BookCover book={book} size="sm" />
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="brand">{book.category}</Badge>
            <AvailabilityBadge book={book} />
            {book.status === 'archived' && <StatusPill tone="neutral" label="Archived" />}
          </div>
          <div>
            <h3 className="text-lg leading-tight font-semibold tracking-tight text-fg">{book.title}</h3>
            <p className="mt-0.5 text-[13px] text-fg-muted">{book.author}</p>
          </div>
          <p className="text-[13px] leading-relaxed text-fg-soft">{book.description}</p>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1 sm:grid-cols-3">
            {meta.map((item) => (
              <div key={item.label} className="min-w-0">
                <p className="flex items-center gap-1 text-[10px] font-medium tracking-[0.08em] text-fg-faint uppercase">
                  <item.icon className="size-2.5" aria-hidden="true" />
                  {item.label}
                </p>
                <p className="truncate text-[12px] text-fg-soft" title={item.value}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/8 bg-ink-950/40 p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11.5px] font-medium text-fg-soft">Copy availability</p>
          <span className="text-[11px] text-fg-muted tabular-nums">
            {availability.available} of {availability.total} available
          </span>
        </div>
        <Progress
          value={availability.onLoan}
          max={availability.total}
          tone={availability.available === 0 ? 'danger' : availability.state === 'limited' ? 'warn' : 'success'}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-muted">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" aria-hidden="true" /> {availability.onLoan} on loan
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" aria-hidden="true" /> {availability.reserved} active reservations
          </span>
          <span>{mode === 'live' ? 'Live Supabase data' : 'Demo data'}</span>
        </div>
      </div>

      {book.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {book.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-fg-muted"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}

      {can('loans.viewAll') && history.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-fg-faint uppercase">
            Recent circulation
          </p>
          <ul className="divide-y divide-white/5 overflow-hidden rounded-lg border border-white/8">
            {history.slice(0, 4).map((loan) => {
              const borrower = data.members.find((m) => m.id === loan.memberId)
              return (
                <li key={loan.id} className="flex items-center gap-2.5 px-3 py-2">
                  <Avatar name={borrower?.name ?? 'Unknown'} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-fg-soft">{borrower?.name ?? loan.memberId}</p>
                    <p className="text-[10.5px] text-fg-faint">
                      {loan.status === 'active'
                        ? `On loan · due ${formatDate(loan.dueAt)}`
                        : `Returned ${formatDate(loan.returnedAt)}`}
                    </p>
                  </div>
                  <span className="text-[10.5px] text-fg-faint">{relativeTime(loan.issuedAt)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Borrow / reserve controls with role-aware policy messaging. */
export function BookCirculationActions({
  book,
  onReserve,
  showWishlist = true,
}: {
  book: Book
  onReserve?: () => void
  showWishlist?: boolean
}) {
  const { data, issueLoan, createReservation } = useLibrary()
  const { member, can } = useAuth()
  const toast = useToast()
  const availability = getAvailability(book, data)

  if (!member) return null

  const selfCheckout = can('loans.selfServe')
  const alreadyBorrowed = data.loans.some(
    (loan) => loan.memberId === member.id && loan.bookId === book.id && loan.status === 'active',
  )
  const activeReservation = data.reservations.find(
    (reservation) =>
      reservation.memberId === member.id &&
      reservation.bookId === book.id &&
      (reservation.status === 'pending' || reservation.status === 'ready'),
  )

  const borrow = async () => {
    const result = await issueLoan({ bookId: book.id, memberId: member.id })
    if (!result.ok) {
      toast.error('Could not issue this copy', result.error)
      return
    }
    toast.success('Book issued', `${book.title} is due ${formatDate(result.value.dueAt)}.`)
  }

  const reserve = async () => {
    if (onReserve) {
      onReserve()
      return
    }
    const result = await createReservation(book.id, member.id)
    if (!result.ok) {
      toast.error('Reservation not created', result.error)
      return
    }
    toast.success(
      result.value.status === 'ready' ? 'Copy held for you' : 'Reservation placed',
      result.value.status === 'ready'
        ? `Collect “${book.title}” by ${formatDate(result.value.expiresAt)}.`
        : `You are in the queue for “${book.title}”.`,
    )
  }

  if (alreadyBorrowed) {
    return (
      <InlineAlert tone="info" title="You have this title on loan">
        Return or renew it from My Loans.
      </InlineAlert>
    )
  }

  if (activeReservation) {
    return (
      <InlineAlert
        tone={activeReservation.status === 'ready' ? 'success' : 'info'}
        title={activeReservation.status === 'ready' ? 'Ready for pickup' : 'Reservation in queue'}
      >
        {activeReservation.status === 'ready'
          ? `Collect this copy by ${formatDate(activeReservation.expiresAt)}.`
          : 'We will notify you when a copy becomes available.'}
      </InlineAlert>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {availability.available > 0 && selfCheckout && book.status === 'active' && (
        <Button onClick={borrow} leftIcon={<BookMarked />}>
          Borrow this copy
        </Button>
      )}
      {(availability.available === 0 || (!selfCheckout && availability.available > 0)) &&
        book.status === 'active' && (
          <Button onClick={reserve} variant={availability.available > 0 ? 'secondary' : 'primary'} leftIcon={<LibraryBig />}>
            {availability.available > 0 ? 'Request at desk' : 'Reserve this title'}
          </Button>
        )}
      {availability.available === 0 && (
        <span className="text-[11.5px] text-fg-muted">All copies are on loan — join the queue</span>
      )}
      {showWishlist && <WishlistButton book={book} />}
    </div>
  )
}
