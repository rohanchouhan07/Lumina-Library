import { BookOpen, CalendarClock, CircleDollarSign, UserRound } from 'lucide-react'
import type { Loan } from '@/types'
import { useLibrary } from '@/providers/LibraryProvider'
import { useToast } from '@/providers/ToastProvider'
import { loanFineAtReturn } from '@/features/library/engine'
import { formatDate, nowISO, overdueDays } from '@/lib/dateUtils'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

export function ReturnDialog({
  loan,
  open,
  onOpenChange,
}: {
  loan: Loan | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data, returnLoan } = useLibrary()
  const toast = useToast()

  if (!loan) return null
  const book = data.books.find((item) => item.id === loan.bookId)
  const member = data.members.find((item) => item.id === loan.memberId)
  const daysLate = overdueDays(loan.dueAt)
  const fine = loanFineAtReturn(loan, nowISO(), data.config)

  const handleReturn = async () => {
    const result = await returnLoan(loan.id)
    if (!result.ok) {
      toast.error('Return not processed', result.error)
      return
    }
    if (result.value.fine > 0) {
      toast.warning(
        'Book returned — fine recorded (simulated)',
        `₹${result.value.fine} simulated fine for ${result.value.daysLate} overdue day${result.value.daysLate === 1 ? '' : 's'}.`,
      )
    } else {
      toast.success('Book returned on time', 'No fine due. A copy is available again.')
    }
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Process return"
      description="Confirm the physical return. Fines are simulated demo values, not real charges."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={fine > 0 ? 'danger' : 'success'} onClick={handleReturn}>
            Confirm return
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-2 rounded-xl border border-white/8 bg-ink-950/40 p-3.5">
          <Row icon={<BookOpen />} label="Book" value={book?.title ?? loan.bookId} sub={book?.author} />
          <Row icon={<UserRound />} label="Borrower" value={member?.name ?? loan.memberId} sub={member?.email} />
          <Row icon={<CalendarClock />} label="Issued" value={formatDate(loan.issuedAt)} />
          <Row
            icon={<CalendarClock />}
            label="Due"
            value={formatDate(loan.dueAt)}
            sub={daysLate > 0 ? `${daysLate} day${daysLate === 1 ? '' : 's'} overdue` : 'Not overdue'}
            danger={daysLate > 0}
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-white/8 bg-ink-950/40 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="size-4 text-warn-400" aria-hidden="true" />
            <div>
              <p className="text-[12.5px] font-medium text-fg">Simulated fine</p>
              <p className="text-[11px] text-fg-faint">
                ₹{data.config.finePerDay}/day × {daysLate} overdue day{daysLate === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <Badge tone={fine > 0 ? 'warn' : 'success'} size="md">
            {fine > 0 ? `₹${fine}` : 'No fine'}
          </Badge>
        </div>
      </div>
    </Dialog>
  )
}

function Row({
  icon,
  label,
  value,
  sub,
  danger,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  danger?: boolean
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-fg-faint [&>svg]:size-3.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium tracking-[0.08em] text-fg-faint uppercase">{label}</p>
        <p className={`truncate text-[13px] ${danger ? 'text-danger-400' : 'text-fg-soft'}`}>{value}</p>
        {sub && <p className="truncate text-[11px] text-fg-faint">{sub}</p>}
      </div>
    </div>
  )
}
