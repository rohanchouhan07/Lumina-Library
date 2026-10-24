import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlarmClock, Bell, BellOff, Bookmark, CircleDollarSign, TriangleAlert } from 'lucide-react'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { Popover } from '@/components/ui/Menu'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { daysUntil, formatDate, overdueDays, relativeTime } from '@/lib/dateUtils'
import { memberOutstandingFines } from '@/features/library/engine'
import type { LucideIcon } from 'lucide-react'

interface Notice {
  id: string
  icon: LucideIcon
  tone: 'danger' | 'warn' | 'brand' | 'violet'
  title: string
  description: string
  at: string
  href: string
}

export function NotificationsPanel() {
  const { data } = useLibrary()
  const { member, can, role } = useAuth()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState<string[]>([])

  const notices = useMemo<Notice[]>(() => {
    if (!member) return []
    const list: Notice[] = []
    const mine = data.loans.filter((loan) => loan.memberId === member.id && loan.status === 'active')
    const staffView = can('loans.viewAll')
    const scope = staffView ? data.loans.filter((loan) => loan.status === 'active') : mine

    for (const loan of scope) {
      if (overdueDays(loan.dueAt) > 0) {
        const book = data.books.find((b) => b.id === loan.bookId)
        const borrower = data.members.find((m) => m.id === loan.memberId)
        list.push({
          id: `overdue-${loan.id}`,
          icon: TriangleAlert,
          tone: 'danger',
          title: `${book?.title ?? 'Book'} is overdue`,
          description: staffView
            ? `${borrower?.name ?? 'Member'} · due ${formatDate(loan.dueAt)}`
            : `Return by ${formatDate(loan.dueAt)} to avoid an overdue fine`,
          at: loan.dueAt,
          href: '/app/loans',
        })
      } else if (daysUntil(loan.dueAt) <= 2) {
        const book = data.books.find((b) => b.id === loan.bookId)
        const borrower = data.members.find((m) => m.id === loan.memberId)
        list.push({
          id: `soon-${loan.id}`,
          icon: AlarmClock,
          tone: 'warn',
          title: `${book?.title ?? 'Book'} is due ${daysUntil(loan.dueAt) === 0 ? 'today' : `in ${daysUntil(loan.dueAt)} day(s)`}`,
          description: staffView ? `${borrower?.name ?? 'Member'} · ${formatDate(loan.dueAt)}` : 'Renew it if you need more time',
          at: loan.dueAt,
          href: '/app/loans',
        })
      }
    }

    const holds = data.reservations.filter(
      (reservation) =>
        reservation.status === 'ready' && (staffView || reservation.memberId === member.id),
    )
    for (const reservation of holds) {
      const book = data.books.find((b) => b.id === reservation.bookId)
      list.push({
        id: `ready-${reservation.id}`,
        icon: Bookmark,
        tone: 'brand',
        title: `Hold ready: ${book?.title ?? 'Title'}`,
        description: reservation.expiresAt
          ? `Collect by ${formatDate(reservation.expiresAt)}`
          : 'Ready for pickup',
        at: reservation.readyAt ?? reservation.createdAt,
        href: '/app/reservations',
      })
    }

    if (staffView) {
      const owing = data.members
        .map((item) => ({ member: item, fines: memberOutstandingFines(data, item.id) }))
        .filter((entry) => entry.fines > 0)
        .sort((a, b) => b.fines - a.fines)
        .slice(0, 2)
      for (const entry of owing) {
        list.push({
          id: `fine-${entry.member.id}`,
          icon: CircleDollarSign,
          tone: 'violet',
          title: `₹${entry.fines} simulated fines outstanding`,
          description: `${entry.member.name} · ${entry.member.id}`,
          at: new Date().toISOString(),
          href: '/app/members',
        })
      }
    } else {
      const fines = memberOutstandingFines(data, member.id)
      if (fines > 0) {
        list.push({
          id: `my-fine-${member.id}`,
          icon: CircleDollarSign,
          tone: 'violet',
          title: `₹${fines} in simulated fines`,
          description: 'Simulated amount — settle at the library desk',
          at: new Date().toISOString(),
          href: '/app/profile',
        })
      }
    }

    return list
      .filter((notice) => !dismissed.includes(notice.id))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 8)
  }, [data, member, can, dismissed])

  const toneClasses: Record<Notice['tone'], string> = {
    danger: 'bg-danger-500/12 text-danger-400 border-danger-500/25',
    warn: 'bg-warn-500/12 text-warn-400 border-warn-500/25',
    brand: 'bg-brand-500/12 text-brand-300 border-brand-500/25',
    violet: 'bg-violet-500/12 text-violet-400 border-violet-500/25',
  }

  return (
    <Popover
      label="Notifications"
      panelClassName="w-[min(92vw,22rem)] p-0"
      trigger={({ toggle, open, ref }) => (
        <IconButton
          ref={ref}
          label={notices.length > 0 ? `Notifications (${notices.length} new)` : 'Notifications'}
          variant="ghost"
          onClick={toggle}
          aria-expanded={open}
          className="relative"
        >
          <Bell className="size-4.5" aria-hidden="true" />
          {notices.length > 0 && (
            <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white">
              {notices.length}
            </span>
          )}
        </IconButton>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-white/6 px-3.5 py-2.5">
            <div>
              <p className="text-[13px] font-semibold text-fg">Notifications</p>
              <p className="text-[11px] text-fg-faint">
                {role === 'student' ? 'Your circulation alerts' : 'Library-wide alerts'}
              </p>
            </div>
            {notices.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDismissed((current) => [...current, ...notices.map((notice) => notice.id)])
                }}
                className="text-[11px] font-medium text-brand-300 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {notices.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <BellOff className="size-5 text-fg-faint" aria-hidden="true" />
                <p className="text-[12.5px] text-fg-soft">You’re all caught up</p>
                <p className="text-[11px] text-fg-faint">Overdue and due-soon items appear here.</p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {notices.map((notice) => {
                  const Icon = notice.icon
                  return (
                    <li key={notice.id}>
                      <button
                        type="button"
                        onClick={() => {
                          navigate(notice.href)
                          close()
                        }}
                        className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
                      >
                        <span
                          className={cn(
                            'mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border',
                            toneClasses[notice.tone],
                          )}
                        >
                          <Icon className="size-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-fg">{notice.title}</span>
                          <span className="block truncate text-[11.5px] text-fg-muted">{notice.description}</span>
                          <span className="mt-0.5 block text-[10px] text-fg-faint">{relativeTime(notice.at)}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Popover>
  )
}
