import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, BookmarkCheck, CalendarClock, Clock, Download, ScanLine, X } from 'lucide-react'
import type { Reservation } from '@/types'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import {
  getAvailability,
  isReservationActive,
  reservationQueuePosition,
} from '@/features/library/engine'
import { exportReservationsCsv } from '@/lib/exportUtils'
import { formatDate, relativeTime } from '@/lib/dateUtils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/Feedback'
import { Avatar } from '@/components/ui/Avatar'
import { BookCover } from '@/components/books/BookCover'
import { ReservationStatusPill } from '@/components/circulation/StatusBits'
import { IssueDialog } from '@/components/circulation/IssueDialog'
import { ConfirmDialog } from '@/components/ui/Dialog'

type TabValue = 'active' | 'pending' | 'ready' | 'completed' | 'all'

export function ReservationsPage() {
  const { data, cancelReservation } = useLibrary()
  const { member, can } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabValue>('active')
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [issueTarget, setIssueTarget] = useState<Reservation | null>(null)

  const staffView = can('reservations.viewAll')
  const scoped = useMemo(
    () => (staffView ? data.reservations : data.reservations.filter((r) => r.memberId === member?.id)),
    [data.reservations, staffView, member?.id],
  )

  const counts = useMemo(
    () => ({
      active: scoped.filter(isReservationActive).length,
      pending: scoped.filter((r) => r.status === 'pending').length,
      ready: scoped.filter((r) => r.status === 'ready').length,
      completed: scoped.filter((r) => ['fulfilled', 'cancelled', 'expired'].includes(r.status)).length,
      all: scoped.length,
    }),
    [scoped],
  )

  const filtered = useMemo(() => {
    return scoped
      .filter((reservation) => {
        if (tab === 'active') return isReservationActive(reservation)
        if (tab === 'pending') return reservation.status === 'pending'
        if (tab === 'ready') return reservation.status === 'ready'
        if (tab === 'completed') return ['fulfilled', 'cancelled', 'expired'].includes(reservation.status)
        return true
      })
      .sort((a, b) => {
        const rank = (r: Reservation) => (r.status === 'ready' ? 0 : r.status === 'pending' ? 1 : 2)
        if (rank(a) !== rank(b)) return rank(a) - rank(b)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  }, [scoped, tab])

  const handleCancel = async () => {
    if (!cancelTarget) return
    const result = await cancelReservation(cancelTarget.id)
    if (!result.ok) {
      toast.error('Reservation not cancelled', result.error)
    } else {
      toast.success('Reservation cancelled', 'The next member in the queue moves up automatically.')
    }
    setCancelTarget(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={staffView ? 'Holds desk' : 'My holds'}
        title={staffView ? 'Reservations' : 'My reservations'}
        description={
          staffView
            ? 'Queue positions update automatically as copies are returned. Ready holds expire after the configured window.'
            : 'Titles you are waiting for, and copies held for pickup.'
        }
        actions={
          <>
            {can('reports.export') && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download />}
                onClick={() => {
                  exportReservationsCsv(data)
                  toast.success('Reservations exported', 'CSV generated from all reservation records.')
                }}
              >
                Export
              </Button>
            )}
            <Button variant="secondary" size="sm" leftIcon={<ScanLine />} onClick={() => navigate('/app/loans?issue=1')}>
              Issue book
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { label: 'Active holds', value: counts.active, icon: Bookmark, tone: 'text-brand-300' },
          { label: 'In queue', value: counts.pending, icon: Clock, tone: 'text-cyan-400' },
          { label: 'Ready for pickup', value: counts.ready, icon: BookmarkCheck, tone: 'text-positive-400' },
          { label: 'Completed / expired', value: counts.completed, icon: CalendarClock, tone: 'text-fg-muted' },
        ].map((stat) => (
          <div key={stat.label} className="surface-card rounded-xl p-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-fg-muted">{stat.label}</p>
              <stat.icon className={`size-3.5 ${stat.tone}`} aria-hidden="true" />
            </div>
            <p className="mt-1 text-[20px] leading-none font-semibold tabular-nums text-fg">{stat.value}</p>
          </div>
        ))}
      </div>

      <Tabs<TabValue>
        aria-label="Filter reservations"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'active', label: 'Active', count: counts.active },
          { value: 'pending', label: 'In queue', count: counts.pending },
          { value: 'ready', label: 'Ready', count: counts.ready },
          { value: 'completed', label: 'History', count: counts.completed },
          { value: 'all', label: 'All', count: counts.all },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Bookmark />}
          title={tab === 'active' ? 'No active reservations' : 'Nothing to show here'}
          description={
            staffView
              ? 'Reservations appear when students request a title whose copies are all on loan.'
              : 'Reserve a title that is fully on loan and it will appear here.'
          }
          action={
            !staffView ? (
              <Button size="sm" variant="secondary" onClick={() => navigate('/app/books')}>
                Browse catalogue
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <TableWrap className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <Th>Title</Th>
                  {staffView && <Th>Member</Th>}
                  <Th>Placed</Th>
                  <Th className="text-center">Queue</Th>
                  <Th>Status</Th>
                  <Th>Hold window</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((reservation) => {
                  const book = data.books.find((item) => item.id === reservation.bookId)
                  const holder = data.members.find((item) => item.id === reservation.memberId)
                  const position = reservationQueuePosition(data, reservation)
                  const availability = book ? getAvailability(book, data) : null
                  const canAct = isReservationActive(reservation)
                  return (
                    <Tr key={reservation.id}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          {book && (
                            <div className="w-7 shrink-0 overflow-hidden rounded shadow-book">
                              <BookCover book={book} size="xs" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="max-w-[210px] truncate font-medium text-fg">{book?.title ?? reservation.bookId}</p>
                            <p className="text-[10.5px] text-fg-faint">
                              {reservation.id} · {availability?.available ?? 0} copies free
                            </p>
                          </div>
                        </div>
                      </Td>
                      {staffView && (
                        <Td>
                          <div className="flex items-center gap-2">
                            <Avatar name={holder?.name ?? 'Unknown'} size="xs" />
                            <div className="min-w-0">
                              <p className="max-w-[130px] truncate text-[12px] text-fg-soft">{holder?.name}</p>
                              <p className="text-[10px] text-fg-faint">{holder?.id}</p>
                            </div>
                          </div>
                        </Td>
                      )}
                      <Td className="text-[11.5px] whitespace-nowrap text-fg-muted">
                        {formatDate(reservation.createdAt)}
                        <span className="ml-1 text-[10px] text-fg-faint">{relativeTime(reservation.createdAt)}</span>
                      </Td>
                      <Td className="text-center">
                        {isReservationActive(reservation) ? (
                          <Badge tone={position === 1 ? 'success' : 'outline'}>#{position}</Badge>
                        ) : (
                          <span className="text-fg-faint">—</span>
                        )}
                      </Td>
                      <Td>
                        <ReservationStatusPill reservation={reservation} />
                      </Td>
                      <Td className="text-[11.5px] whitespace-nowrap text-fg-muted">
                        {reservation.status === 'ready' && reservation.expiresAt
                          ? `Collect by ${formatDate(reservation.expiresAt)}`
                          : reservation.status === 'expired'
                            ? 'Window elapsed'
                            : '—'}
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1.5">
                          {reservation.status === 'ready' && staffView && (
                            <Button size="xs" variant="secondary" onClick={() => setIssueTarget(reservation)}>
                              Issue copy
                            </Button>
                          )}
                          {canAct && (
                            <Button
                              size="xs"
                              variant="ghost"
                              leftIcon={<X />}
                              onClick={() => setCancelTarget(reservation)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </TableWrap>

          <ul className="space-y-2 md:hidden">
            {filtered.map((reservation) => {
              const book = data.books.find((item) => item.id === reservation.bookId)
              const holder = data.members.find((item) => item.id === reservation.memberId)
              const position = reservationQueuePosition(data, reservation)
              return (
                <li key={reservation.id} className="surface-card rounded-xl p-3">
                  <div className="flex items-start gap-2.5">
                    {book && (
                      <div className="w-8 shrink-0 overflow-hidden rounded shadow-book">
                        <BookCover book={book} size="xs" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-fg">{book?.title}</p>
                      <p className="truncate text-[11px] text-fg-muted">
                        {staffView ? `${holder?.name} · ` : ''}
                        {formatDate(reservation.createdAt)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <ReservationStatusPill reservation={reservation} />
                        {isReservationActive(reservation) && (
                          <Badge tone="outline">Queue #{position}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {isReservationActive(reservation) && (
                    <div className="mt-2.5 flex gap-2">
                      {reservation.status === 'ready' && staffView && (
                        <Button size="xs" className="flex-1" onClick={() => setIssueTarget(reservation)}>
                          Issue copy
                        </Button>
                      )}
                      <Button size="xs" variant="secondary" className="flex-1" onClick={() => setCancelTarget(reservation)}>
                        Cancel hold
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-fg-faint uppercase">Reservation policy</p>
        <ul className="mt-1.5 grid gap-1 text-[11.5px] leading-relaxed text-fg-muted sm:grid-cols-3">
          <li>• When a copy is returned, the oldest hold becomes ready automatically.</li>
          <li>• Ready holds expire after {data.config.reservationHoldDays} days and move to history.</li>
          <li>• Duplicate active holds for the same title are blocked.</li>
        </ul>
      </div>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel this reservation?"
        description="The next member in the queue will move up. This cannot be undone."
        confirmLabel="Cancel reservation"
        cancelLabel="Keep hold"
        destructive
        onConfirm={handleCancel}
      />

      <IssueDialog
        open={Boolean(issueTarget)}
        onOpenChange={(open) => !open && setIssueTarget(null)}
        presetBookId={issueTarget?.bookId}
        presetMemberId={issueTarget?.memberId}
      />
    </div>
  )
}
