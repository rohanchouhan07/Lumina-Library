import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  ArrowRight,
  BookCheck,
  BookMarked,
  Bookmark,
  CalendarClock,
  LibraryBig,
  ScanLine,
  TriangleAlert,
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
import { EmptyState } from '@/components/ui/Feedback'
import { ActivityFeed } from '@/components/circulation/ActivityFeed'
import { LoanStatusPill } from '@/components/circulation/StatusBits'
import { Tabs } from '@/components/ui/Tabs'
import { useState } from 'react'
import { formatDate, isToday, overdueDays } from '@/lib/dateUtils'
import { getAvailability } from '@/features/library/engine'
import { ReturnDialog } from '@/components/circulation/ReturnDialog'
import type { Loan } from '@/types'

export function LibrarianDashboard() {
  const { data, stats } = useLibrary()
  const { member } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [returnTarget, setReturnTarget] = useState<Loan | null>(null)
  const [queueTab, setQueueTab] = useState<'due-today' | 'overdue'>('due-today')

  const activeLoans = data.loans.filter((loan) => loan.status === 'active')
  const dueToday = activeLoans.filter((loan) => isToday(loan.dueAt))
  const overdue = activeLoans
    .filter((loan) => overdueDays(loan.dueAt) > 0)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
  const readyHolds = data.reservations.filter((reservation) => reservation.status === 'ready')
  const queue = queueTab === 'due-today' ? dueToday : overdue

  const recent = [...data.loans]
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
    .slice(0, 5)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Circulation desk"
        title={`${greeting}, ${member?.name.split(' ')[0] ?? 'librarian'}`}
        description="Everything waiting at the desk today — issues, returns, holds and overdue follow-ups."
        actions={
          <>
            <Button variant="secondary" size="sm" leftIcon={<ScanLine />} onClick={() => navigate('/app/loans')}>
              Desk queue
            </Button>
            <Button size="sm" leftIcon={<ArrowLeftRight />} onClick={() => navigate('/app/loans?issue=1')}>
              Issue book
            </Button>
          </>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: 'Currently issued', value: stats.activeLoans, icon: BookMarked, tone: 'brand' as const, hint: `${stats.utilisation}% utilisation` },
          { label: 'Due today', value: dueToday.length, icon: CalendarClock, tone: 'warn' as const, hint: 'Returns expected' },
          { label: 'Overdue', value: stats.overdueLoans, icon: TriangleAlert, tone: 'danger' as const, hint: 'Follow up today' },
          { label: 'Available copies', value: stats.availableCopies, icon: LibraryBig, tone: 'success' as const, hint: `of ${stats.totalCopies}` },
          { label: 'Pending holds', value: stats.pendingReservations, icon: Bookmark, tone: 'violet' as const, hint: `${readyHolds.length} ready` },
        ].map((item) => (
          <StaggerItem key={item.label}>
            <StatCard {...item} />
          </StaggerItem>
        ))}
      </Stagger>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-col items-start gap-2 sm:flex-row sm:items-center">
            <CardTitle>Desk queue</CardTitle>
            <Tabs<'due-today' | 'overdue'>
              aria-label="Desk queue filter"
              size="sm"
              value={queueTab}
              onChange={setQueueTab}
              items={[
                { value: 'due-today', label: 'Due today', count: dueToday.length },
                { value: 'overdue', label: 'Overdue', count: overdue.length },
              ]}
            />
          </CardHeader>
          <CardContent>
            {queue.length === 0 ? (
              <EmptyState
                compact
                icon={<BookCheck />}
                title={queueTab === 'due-today' ? 'No returns due today' : 'No overdue books'}
                description={
                  queueTab === 'due-today'
                    ? 'The desk is clear for scheduled returns.'
                    : 'Every active loan is within its due date.'
                }
              />
            ) : (
              <ul className="space-y-1.5">
                {queue.slice(0, 6).map((loan) => {
                  const book = data.books.find((item) => item.id === loan.bookId)
                  const borrower = data.members.find((item) => item.id === loan.memberId)
                  return (
                    <li
                      key={loan.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-white/6 bg-ink-870/50 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-fg">{book?.title}</p>
                        <p className="truncate text-[10.5px] text-fg-muted">
                          {borrower?.name} · {borrower?.id} · due {formatDate(loan.dueAt)}
                        </p>
                      </div>
                      <LoanStatusPill loan={loan} />
                      <Button size="xs" variant="secondary" onClick={() => setReturnTarget(loan)}>
                        Return
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Holds ready</CardTitle>
            <Badge tone={readyHolds.length > 0 ? 'success' : 'outline'}>{readyHolds.length}</Badge>
          </CardHeader>
          <CardContent>
            {readyHolds.length === 0 ? (
              <EmptyState compact title="No holds to release" description="Reservations appear once a copy frees up." />
            ) : (
              <ul className="space-y-1.5">
                {readyHolds.slice(0, 5).map((reservation) => {
                  const book = data.books.find((item) => item.id === reservation.bookId)
                  const holder = data.members.find((item) => item.id === reservation.memberId)
                  return (
                    <li key={reservation.id} className="rounded-lg border border-white/6 bg-ink-870/50 px-3 py-2">
                      <p className="truncate text-[12px] font-medium text-fg">{book?.title}</p>
                      <p className="truncate text-[10.5px] text-fg-muted">
                        {holder?.name} · collect by {formatDate(reservation.expiresAt)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
            <Button
              variant="ghost"
              size="xs"
              className="mt-2"
              rightIcon={<ArrowRight />}
              onClick={() => navigate('/app/reservations')}
            >
              Manage reservations
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="items-center">
            <CardTitle>Recent transactions</CardTitle>
            <Button variant="ghost" size="xs" rightIcon={<ArrowRight />} onClick={() => navigate('/app/loans')}>
              All loans
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {recent.map((loan) => {
                const book = data.books.find((item) => item.id === loan.bookId)
                const borrower = data.members.find((item) => item.id === loan.memberId)
                return (
                  <li key={loan.id} className="flex items-center gap-2.5 py-1">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md border border-white/8 bg-white/[0.03]">
                      {loan.status === 'active' ? (
                        <BookMarked className="size-3.5 text-brand-300" aria-hidden="true" />
                      ) : (
                        <BookCheck className="size-3.5 text-positive-400" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] text-fg-soft">
                        {loan.status === 'active' ? 'Issued' : 'Returned'} “{book?.title}”
                      </p>
                      <p className="truncate text-[10.5px] text-fg-faint">
                        {borrower?.name} · {formatDate(loan.status === 'active' ? loan.issuedAt : loan.returnedAt)}
                      </p>
                    </div>
                    <Badge tone="outline">{loan.id}</Badge>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity log</CardTitle>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                const unavailable = data.books.filter((book) => getAvailability(book, data).available === 0)
                toast.info(
                  `${unavailable.length} titles fully on loan`,
                  unavailable.length ? unavailable.slice(0, 3).map((b) => b.title).join(', ') : 'All titles have copies free.',
                )
              }}
            >
              Inventory check
            </Button>
          </CardHeader>
          <CardContent>
            <ActivityFeed entries={data.activity} limit={5} />
          </CardContent>
        </Card>
      </div>

      <ReturnDialog
        loan={returnTarget}
        open={Boolean(returnTarget)}
        onOpenChange={(open) => !open && setReturnTarget(null)}
      />
    </div>
  )
}
