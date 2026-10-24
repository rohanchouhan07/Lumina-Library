import {
  Archive,
  BookCheck,
  BookPlus,
  BookmarkPlus,
  CalendarClock,
  CircleSlash,
  Database,
  RefreshCcw,
  Settings2,
  UserPlus,
  UserCog,
  CheckCircle2,
} from 'lucide-react'
import type { ActivityEntry, ActivityKind } from '@/types'
import { relativeTime } from '@/lib/dateUtils'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/Feedback'

const KIND_META: Record<ActivityKind, { icon: typeof BookPlus; tone: string; label: string }> = {
  'book.created': { icon: BookPlus, tone: 'text-positive-400 bg-positive-500/10', label: 'Book added' },
  'book.updated': { icon: BookCheck, tone: 'text-brand-300 bg-brand-500/10', label: 'Book updated' },
  'book.archived': { icon: Archive, tone: 'text-fg-muted bg-white/6', label: 'Book archived' },
  'book.deleted': { icon: CircleSlash, tone: 'text-danger-400 bg-danger-500/10', label: 'Book deleted' },
  'member.created': { icon: UserPlus, tone: 'text-cyan-400 bg-cyan-500/10', label: 'Member added' },
  'member.updated': { icon: UserCog, tone: 'text-brand-300 bg-brand-500/10', label: 'Member updated' },
  'member.status': { icon: UserCog, tone: 'text-warn-400 bg-warn-500/10', label: 'Status changed' },
  'loan.issued': { icon: BookPlus, tone: 'text-brand-300 bg-brand-500/10', label: 'Issued' },
  'loan.returned': { icon: CheckCircle2, tone: 'text-positive-400 bg-positive-500/10', label: 'Returned' },
  'loan.renewed': { icon: RefreshCcw, tone: 'text-violet-400 bg-violet-500/10', label: 'Renewed' },
  'reservation.created': { icon: BookmarkPlus, tone: 'text-cyan-400 bg-cyan-500/10', label: 'Reserved' },
  'reservation.cancelled': { icon: CircleSlash, tone: 'text-fg-muted bg-white/6', label: 'Cancelled' },
  'reservation.ready': { icon: CalendarClock, tone: 'text-positive-400 bg-positive-500/10', label: 'Hold ready' },
  'reservation.fulfilled': { icon: BookCheck, tone: 'text-violet-400 bg-violet-500/10', label: 'Hold fulfilled' },
  'reservation.expired': { icon: CircleSlash, tone: 'text-danger-400 bg-danger-500/10', label: 'Hold expired' },
  'config.updated': { icon: Settings2, tone: 'text-brand-300 bg-brand-500/10', label: 'Policy' },
  'data.reset': { icon: Database, tone: 'text-warn-400 bg-warn-500/10', label: 'Reset' },
}

export function ActivityFeed({
  entries,
  limit = 6,
  className,
  showActor = true,
}: {
  entries: ActivityEntry[]
  limit?: number
  className?: string
  showActor?: boolean
}) {
  if (entries.length === 0) {
    return <EmptyState compact icon={<CalendarClock />} title="No activity yet" description="Actions you take will appear here." />
  }
  return (
    <ol className={cn('relative space-y-0', className)}>
      {entries.slice(0, limit).map((entry, index, list) => {
        const meta = KIND_META[entry.kind] ?? KIND_META['book.updated']
        const Icon = meta.icon
        return (
          <li key={entry.id} className="relative flex gap-3 pb-3.5 last:pb-0">
            {index < list.length - 1 && (
              <span aria-hidden="true" className="absolute top-8 left-3.5 h-full w-px bg-white/6" />
            )}
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-full border border-white/8', meta.tone)}>
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[12.5px] leading-snug text-fg-soft">{entry.message}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] text-fg-faint">
                <span className="font-medium tracking-wide uppercase">{meta.label}</span>
                <span aria-hidden="true">·</span>
                <span>{relativeTime(entry.at)}</span>
                {showActor && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Avatar name={entry.actor} size="xs" className="size-3.5 text-[7px]" />
                      {entry.actor}
                    </span>
                  </>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
