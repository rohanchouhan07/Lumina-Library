import { Badge, StatusPill } from '@/components/ui/Badge'
import type { Loan, Reservation } from '@/types'
import { daysUntil, formatDate, overdueDays } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'

export function LoanStatusPill({ loan }: { loan: Loan }) {
  if (loan.status === 'returned') return <StatusPill tone="neutral" label="Returned" />
  const late = overdueDays(loan.dueAt)
  if (late > 0) return <StatusPill tone="danger" label={`Overdue ${late}d`} pulse />
  const days = daysUntil(loan.dueAt)
  if (days === 0) return <StatusPill tone="warn" label="Due today" />
  if (days <= 3) return <StatusPill tone="warn" label={`Due in ${days}d`} />
  return <StatusPill tone="success" label="On loan" />
}

const RESERVATION_META: Record<
  Reservation['status'],
  { label: string; tone: 'brand' | 'violet' | 'success' | 'neutral' | 'danger' | 'warn' }
> = {
  pending: { label: 'In queue', tone: 'brand' },
  ready: { label: 'Ready for pickup', tone: 'success' },
  fulfilled: { label: 'Fulfilled', tone: 'violet' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'danger' },
}

export function ReservationStatusPill({ reservation }: { reservation: Reservation }) {
  const meta = RESERVATION_META[reservation.status]
  return <StatusPill tone={meta.tone} label={meta.label} pulse={reservation.status === 'ready'} />
}

export function DueDate({ dueAt, late }: { dueAt: string; late?: boolean }) {
  return (
    <span className={cn('tabular-nums', late ? 'text-danger-400' : 'text-fg-soft')}>
      {formatDate(dueAt)}
    </span>
  )
}

export function FineTag({ amount, muted = false }: { amount: number; muted?: boolean }) {
  if (amount <= 0) return <span className="text-[11px] text-fg-faint">No fine</span>
  return (
    <Badge tone={muted ? 'neutral' : 'warn'} title="Simulated demo amount — not an actual charge">
      ₹{amount} demo
    </Badge>
  )
}
