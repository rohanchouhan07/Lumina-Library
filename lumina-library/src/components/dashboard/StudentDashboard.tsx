import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookHeart,
  BookMarked,
  Bookmark,
  BookOpenCheck,
  CalendarClock,
  CircleDollarSign,
  Heart,
  RefreshCcw,
  Sparkles,
} from 'lucide-react'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from './StatCard'
import { Stagger, StaggerItem } from '@/components/animation/Reveal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState, InlineAlert, Progress } from '@/components/ui/Feedback'
import { ActivityFeed } from '@/components/circulation/ActivityFeed'
import { ReservationStatusPill, FineTag } from '@/components/circulation/StatusBits'
import { BookCard } from '@/components/books/BookCard'
import { BookCover } from '@/components/books/BookCover'
import {
  canRenew,
  getAvailability,
  loanFine,
  memberBorrowLimit,
  memberOutstandingFines,
  reservationQueuePosition,
} from '@/features/library/engine'
import { daysUntil, dueLabel, formatDate, overdueDays } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import type { Book } from '@/types'
import { BookDetailDialog } from '@/components/books/BookDetailDialog'

export function StudentDashboard() {
  const { data, renewLoan, cancelReservation } = useLibrary()
  const { member } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)

  const loans = useMemo(
    () =>
      member
        ? data.loans
            .filter((loan) => loan.memberId === member.id && loan.status === 'active')
            .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
        : [],
    [data.loans, member],
  )
  const reservations = useMemo(
    () =>
      member
        ? data.reservations
            .filter((reservation) => reservation.memberId === member.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : [],
    [data.reservations, member],
  )
  const activeHolds = reservations.filter((reservation) => ['pending', 'ready'].includes(reservation.status))
  const wishlist = member ? (data.wishlists[member.id] ?? []) : []
  const fines = member ? memberOutstandingFines(data, member.id) : 0
  const limit = member ? memberBorrowLimit(member, data.config) : 0

  const history = useMemo(
    () =>
      member
        ? data.loans
            .filter((loan) => loan.memberId === member.id && loan.status === 'returned')
            .sort((a, b) => new Date(b.returnedAt ?? '').getTime() - new Date(a.returnedAt ?? '').getTime())
        : [],
    [data.loans, member],
  )

  const recommended = useMemo(() => {
    if (!member) return []
    const borrowedCategories = new Set(
      history
        .map((loan) => data.books.find((book) => book.id === loan.bookId)?.category)
        .filter((category): category is string => Boolean(category)),
    )
    const owned = new Set([
      ...loans.map((loan) => loan.bookId),
      ...wishlist,
    ])
    return data.books
      .filter((book) => book.status === 'active' && !owned.has(book.id))
      .filter((book) => getAvailability(book, data).available > 0)
      .sort((a, b) => {
        const aScore = (borrowedCategories.has(a.category) ? 1 : 0) + a.coverSeed / 1000
        const bScore = (borrowedCategories.has(b.category) ? 1 : 0) + b.coverSeed / 1000
        return bScore - aScore
      })
      .slice(0, 4)
  }, [data, history, loans, member, wishlist])

  if (!member) return null

  const dueSoon = loans.filter((loan) => daysUntil(loan.dueAt) <= 3)
  const personalActivity = data.activity.filter(
    (entry) => entry.memberId === member.id || entry.message.includes(member.name),
  )

  const handleRenew = async (loanId: string) => {
    const result = await renewLoan(loanId)
    if (!result.ok) {
      toast.error('Renewal not possible', result.error)
      return
    }
    toast.success('Loan renewed', `New due date: ${formatDate(result.value.dueAt)}.`)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${member.department} · ${member.id}`}
        title={`Welcome back, ${member.name.split(' ')[0]}`}
        description="Your loans, holds and reading list — all in one place."
        actions={
          <Button size="sm" leftIcon={<BookOpenCheck />} onClick={() => navigate('/app/books')}>
            Browse catalogue
          </Button>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Books on loan',
            value: loans.length,
            icon: BookMarked,
            tone: 'brand' as const,
            hint: `Limit ${limit} books`,
            footer: <Progress value={loans.length} max={limit} tone="brand" />,
          },
          { label: 'Due within 3 days', value: dueSoon.length, icon: CalendarClock, tone: 'warn' as const, hint: dueSoon.length ? 'Renew or return soon' : 'Nothing urgent' },
          { label: 'Active holds', value: activeHolds.length, icon: Bookmark, tone: 'violet' as const, hint: `${activeHolds.filter((r) => r.status === 'ready').length} ready` },
          { label: 'Simulated fines', value: fines, prefix: '₹', icon: CircleDollarSign, tone: fines > 0 ? ('danger' as const) : ('success' as const), hint: 'Simulated amount' },
        ].map((item) => (
          <StaggerItem key={item.label}>
            <StatCard {...item} />
          </StaggerItem>
        ))}
      </Stagger>

      {fines > 0 && (
        <InlineAlert tone="warn" title={`₹${fines} in simulated fines`}>
          These are demo values calculated at ₹{data.config.finePerDay} per overdue day. They are not real college charges.
        </InlineAlert>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="items-center">
            <div>
              <CardTitle>Current loans</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-fg-muted">Return at the desk or renew before the due date</p>
            </div>
            <Badge tone="outline">{loans.length} active</Badge>
          </CardHeader>
          <CardContent>
            {loans.length === 0 ? (
              <EmptyState
                icon={<BookHeart />}
                title="No books on loan"
                description="Browse the catalogue to borrow or reserve your next read."
                action={
                  <Button size="sm" onClick={() => navigate('/app/books')}>
                    Explore catalogue
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-2">
                {loans.map((loan) => {
                  const book = data.books.find((item) => item.id === loan.bookId)
                  if (!book) return null
                  const due = dueLabel(loan.dueAt)
                  const renewable = canRenew(data, loan)
                  const late = overdueDays(loan.dueAt)
                  return (
                    <li
                      key={loan.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-white/6 bg-ink-870/50 p-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedBook(book)}
                        className="w-9 shrink-0 overflow-hidden rounded shadow-book"
                        aria-label={`View ${book.title}`}
                      >
                        <BookCover book={book} size="xs" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setSelectedBook(book)}
                          className="block max-w-full truncate text-left text-[13px] font-medium text-fg hover:text-brand-200"
                        >
                          {book.title}
                        </button>
                        <p className="truncate text-[11px] text-fg-muted">
                          {book.author} · issued {formatDate(loan.issuedAt)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={cn(
                            'text-[11.5px] font-medium',
                            due.tone === 'overdue' ? 'text-danger-400' : due.tone === 'soon' ? 'text-warn-400' : 'text-fg-soft',
                          )}
                        >
                          {due.text}
                        </span>
                        {late > 0 && <FineTag amount={loanFine(loan, data.config)} />}
                      </div>
                      <Button
                        size="xs"
                        variant="secondary"
                        leftIcon={<RefreshCcw />}
                        disabled={!renewable.ok}
                        title={renewable.ok ? 'Renew this loan' : renewable.error}
                        onClick={() => handleRenew(loan.id)}
                      >
                        Renew
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
            {loans.length > 0 && (
              <p className="mt-2 text-[10.5px] text-fg-faint">
                Renewals: up to {data.config.maxRenewals} per loan · overdue or reserved titles cannot be renewed.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reservations</CardTitle>
            <Badge tone={activeHolds.length ? 'brand' : 'outline'}>{activeHolds.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeHolds.length === 0 ? (
              <EmptyState compact title="No active holds" description="Reserve a title that is fully on loan." />
            ) : (
              activeHolds.map((reservation) => {
                const book = data.books.find((item) => item.id === reservation.bookId)
                return (
                  <div key={reservation.id} className="rounded-lg border border-white/6 bg-ink-870/50 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{book?.title}</p>
                      <ReservationStatusPill reservation={reservation} />
                    </div>
                    <p className="mt-1 text-[10.5px] text-fg-muted">
                      Queue #{reservationQueuePosition(data, reservation)} ·{' '}
                      {reservation.status === 'ready'
                        ? `collect by ${formatDate(reservation.expiresAt)}`
                        : `placed ${formatDate(reservation.createdAt)}`}
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        const result = await cancelReservation(reservation.id)
                        if (!result.ok) toast.error('Cannot cancel', result.error)
                        else toast.success('Reservation cancelled', book?.title)
                      }}
                      className="mt-1 text-[10.5px] font-medium text-fg-faint transition-colors hover:text-danger-400"
                    >
                      Cancel reservation
                    </button>
                  </div>
                )
              })
            )}
            <Button
              variant="ghost"
              size="xs"
              rightIcon={<ArrowRight />}
              onClick={() => navigate('/app/reservations')}
            >
              All reservations
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="items-center">
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-violet-400" aria-hidden="true" /> Recommended for you
              </CardTitle>
              <p className="mt-0.5 text-[11.5px] text-fg-muted">Based on your borrowing history</p>
            </div>
            <Button variant="ghost" size="xs" rightIcon={<ArrowRight />} onClick={() => navigate('/app/books')}>
              Catalogue
            </Button>
          </CardHeader>
          <CardContent>
            {recommended.length === 0 ? (
              <EmptyState compact title="Nothing to recommend yet" description="Borrow a few titles to unlock suggestions." />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {recommended.map((book) => (
                  <BookCard key={book.id} book={book} onOpen={() => setSelectedBook(book)} compact />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wishlist</CardTitle>
            <Badge tone="outline">{wishlist.length}</Badge>
          </CardHeader>
          <CardContent>
            {wishlist.length === 0 ? (
              <EmptyState compact icon={<Heart />} title="Wishlist empty" description="Tap the heart on any title to save it." />
            ) : (
              <ul className="space-y-1.5">
                {wishlist.slice(0, 5).map((bookId) => {
                  const book = data.books.find((item) => item.id === bookId)
                  if (!book) return null
                  const availability = getAvailability(book, data)
                  return (
                    <li key={bookId}>
                      <button
                        type="button"
                        onClick={() => setSelectedBook(book)}
                        className="flex w-full items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <div className="w-7 shrink-0 overflow-hidden rounded shadow-book">
                          <BookCover book={book} size="xs" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] text-fg-soft">{book.title}</p>
                          <p className="text-[10px] text-fg-faint">
                            {availability.available > 0 ? `${availability.available} available` : 'All copies out'}
                          </p>
                        </div>
                        <ArrowRight className="size-3 text-fg-faint" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reading history</CardTitle>
            <Badge tone="outline">{history.length} returned</Badge>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <EmptyState compact title="No reading history yet" />
            ) : (
              <ul className="space-y-1.5">
                {history.slice(0, 5).map((loan) => {
                  const book = data.books.find((item) => item.id === loan.bookId)
                  return (
                    <li key={loan.id} className="flex items-center justify-between gap-2 py-1">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] text-fg-soft">{book?.title}</p>
                        <p className="text-[10.5px] text-fg-faint">
                          {formatDate(loan.issuedAt)} → {formatDate(loan.returnedAt)}
                        </p>
                      </div>
                      <FineTag amount={loan.fineAmount ?? 0} muted />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed entries={personalActivity} limit={5} showActor={false} />
          </CardContent>
        </Card>
      </div>

      <BookDetailDialog book={selectedBook} open={Boolean(selectedBook)} onOpenChange={(open) => !open && setSelectedBook(null)} />
    </div>
  )
}
