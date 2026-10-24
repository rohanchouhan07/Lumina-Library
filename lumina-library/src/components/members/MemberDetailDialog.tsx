import { useState } from 'react'
import { CalendarDays, Mail, Pencil, Phone, ShieldCheck, UserCheck, UserX } from 'lucide-react'
import type { Member } from '@/types'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import {
  memberActiveLoans,
  memberBorrowLimit,
  memberLoanHistory,
  memberOutstandingFines,
  reservationQueuePosition,
} from '@/features/library/engine'
import { formatDate, relativeTime } from '@/lib/dateUtils'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Badge, StatusPill } from '@/components/ui/Badge'
import { Tabs } from '@/components/ui/Tabs'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/Feedback'
import { LoanStatusPill, ReservationStatusPill, FineTag } from '@/components/circulation/StatusBits'

type TabValue = 'loans' | 'history' | 'reservations'

export function MemberDetailDialog({
  member,
  open,
  onOpenChange,
  onEdit,
}: {
  member: Member | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (member: Member) => void
}) {
  const { data, toggleMemberStatus, returnLoan } = useLibrary()
  const { can } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<TabValue>('loans')

  if (!member) return null

  const active = memberActiveLoans(data, member.id)
  const history = memberLoanHistory(data, member.id)
    .filter((loan) => loan.status === 'returned')
    .sort((a, b) => new Date(b.returnedAt ?? b.issuedAt).getTime() - new Date(a.returnedAt ?? a.issuedAt).getTime())
  const reservations = data.reservations.filter(
    (reservation) => reservation.memberId === member.id && ['pending', 'ready'].includes(reservation.status),
  )
  const fines = memberOutstandingFines(data, member.id)
  const limit = memberBorrowLimit(member, data.config)

  const toggleStatus = async () => {
    const result = await toggleMemberStatus(member.id)
    if (!result.ok) {
      toast.error('Membership not updated', result.error)
      return
    }
    toast.success(
      result.value.status === 'active' ? 'Membership activated' : 'Membership deactivated',
      result.value.name,
    )
  }

  const processReturn = async (loanId: string) => {
    const result = await returnLoan(loanId)
    if (!result.ok) {
      toast.error('Return not processed', result.error)
      return
    }
    toast.success(
      'Book returned',
      result.value.fine > 0 ? `₹${result.value.fine} simulated fine applied.` : 'No fine due.',
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Member record"
      description={`${member.id} · registered ${formatDate(member.joinedAt)}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {can('members.update') && (
            <Button variant="secondary" leftIcon={<Pencil />} onClick={() => onEdit(member)}>
              Edit details
            </Button>
          )}
          {can('members.toggleStatus') && (
            <Button
              variant={member.status === 'active' ? 'outline' : 'success'}
              leftIcon={member.status === 'active' ? <UserX /> : <UserCheck />}
              onClick={toggleStatus}
            >
              {member.status === 'active' ? 'Deactivate' : 'Activate'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={member.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-fg">{member.name}</h3>
              <Badge tone={member.role === 'admin' ? 'brand' : member.role === 'librarian' ? 'violet' : 'cyan'}>
                {member.role === 'admin' ? 'Administrator' : member.role === 'librarian' ? 'Librarian' : 'Student'}
              </Badge>
              <StatusPill
                tone={member.status === 'active' ? 'success' : 'neutral'}
                label={member.status === 'active' ? 'Active' : 'Inactive'}
              />
            </div>
            <p className="mt-0.5 text-[12px] text-fg-muted">
              {member.department} · {member.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="On loan" value={`${active.length}/${limit}`} />
          <Stat label="Active holds" value={String(reservations.length)} />
          <Stat label="Simulated fines" value={`₹${fines}`} tone={fines > 0 ? 'warn' : undefined} />
          <Stat label="Total loans" value={String(history.length + active.length)} />
        </div>

        <div className="grid gap-2 rounded-lg border border-white/8 bg-ink-950/40 p-3 text-[12px] sm:grid-cols-2">
          <Detail icon={<Mail />} label="Email" value={member.email} />
          <Detail icon={<Phone />} label="Phone" value={member.phone || 'Not provided'} />
          <Detail icon={<ShieldCheck />} label="Borrow limit" value={`${limit} books`} />
          <Detail icon={<CalendarDays />} label="Member since" value={formatDate(member.joinedAt)} />
          {member.notes && (
            <p className="text-[11.5px] text-fg-muted sm:col-span-2">Note: {member.notes}</p>
          )}
        </div>

        <Tabs<TabValue>
          aria-label="Member records"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'loans', label: 'Current loans', count: active.length },
            { value: 'history', label: 'History', count: history.length },
            { value: 'reservations', label: 'Reservations', count: reservations.length },
          ]}
        />

        <div className="min-h-32">
          {tab === 'loans' &&
            (active.length === 0 ? (
              <EmptyState compact title="No books on loan" description="This member has no active circulation." />
            ) : (
              <ul className="space-y-1.5">
                {active.map((loan) => {
                  const book = data.books.find((item) => item.id === loan.bookId)
                  return (
                    <li
                      key={loan.id}
                      className="flex items-center gap-2 rounded-lg border border-white/6 bg-ink-870/60 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-fg">{book?.title ?? loan.bookId}</p>
                        <p className="text-[10.5px] text-fg-faint">
                          Issued {formatDate(loan.issuedAt)} · due {formatDate(loan.dueAt)}
                        </p>
                      </div>
                      <LoanStatusPill loan={loan} />
                      {can('loans.return') && (
                        <Button size="xs" variant="secondary" onClick={() => processReturn(loan.id)}>
                          Return
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            ))}

          {tab === 'history' &&
            (history.length === 0 ? (
              <EmptyState compact title="No returned loans yet" description="Completed circulation will appear here." />
            ) : (
              <ul className="space-y-1.5">
                {history.slice(0, 8).map((loan) => {
                  const book = data.books.find((item) => item.id === loan.bookId)
                  return (
                    <li
                      key={loan.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/6 bg-ink-870/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] text-fg-soft">{book?.title ?? loan.bookId}</p>
                        <p className="text-[10.5px] text-fg-faint">
                          {formatDate(loan.issuedAt)} → {formatDate(loan.returnedAt)} · {relativeTime(loan.returnedAt ?? loan.issuedAt)}
                        </p>
                      </div>
                      <FineTag amount={loan.fineAmount ?? 0} />
                    </li>
                  )
                })}
              </ul>
            ))}

          {tab === 'reservations' &&
            (reservations.length === 0 ? (
              <EmptyState compact title="No active reservations" description="Holds placed by this member appear here." />
            ) : (
              <ul className="space-y-1.5">
                {reservations.map((reservation) => {
                  const book = data.books.find((item) => item.id === reservation.bookId)
                  return (
                    <li
                      key={reservation.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/6 bg-ink-870/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] text-fg-soft">{book?.title ?? reservation.bookId}</p>
                        <p className="text-[10.5px] text-fg-faint">
                          Placed {formatDate(reservation.createdAt)} · queue #{reservationQueuePosition(data, reservation)}
                        </p>
                      </div>
                      <ReservationStatusPill reservation={reservation} />
                    </li>
                  )
                })}
              </ul>
            ))}
        </div>
      </div>
    </Dialog>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.025] px-2.5 py-2">
      <p className="text-[10px] font-medium tracking-[0.06em] text-fg-faint uppercase">{label}</p>
      <p className={`mt-0.5 text-[15px] font-semibold ${tone === 'warn' ? 'text-warn-400' : 'text-fg'}`}>{value}</p>
    </div>
  )
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-fg-faint [&>svg]:size-3.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] tracking-[0.06em] text-fg-faint uppercase">{label}</p>
        <p className="truncate text-[12px] text-fg-soft">{value}</p>
      </div>
    </div>
  )
}
