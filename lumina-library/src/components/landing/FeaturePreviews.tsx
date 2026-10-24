import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  BookOpen,
  Bookmark,
  CheckCircle2,
  Clock,
  Heart,
  LibraryBig,
  RefreshCw,
  ScanLine,
  Search,
  Users,
} from 'lucide-react'
import { Badge, StatusPill, type BadgeTone } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Feedback'
import { cn } from '@/lib/utils'
import type { ApiBook } from '@/types/api'

/**
 * Decorative previews for the landing page's feature showcase.
 *
 * Everything here is illustrative. The circulation, self-service, reservation, analytics and
 * member panels run on the fictional SAMPLE_* arrays below — masked IDs, invented titles and
 * invented dates — because a public landing page must never render a real member's name,
 * email, ID, loan or fine. Only the catalogue panel can quote live data, and only the
 * title-level rows the public `catalogue.public` action already exposes.
 */

/* ------------------------------------------------------------------ sample data */

/** Fictional titles used when the live catalogue is unavailable (offline demo, cold start). */
const SAMPLE_CATALOGUE: Array<{
  title: string
  author: string
  category: string
  shelf: string
  available: number
  total: number
}> = [
  { title: 'Data Structures in Practice', author: 'M. Fareed', category: 'Computer Science', shelf: 'CS-12', available: 2, total: 4 },
  { title: 'The Quiet Cartographer', author: 'L. Iyengar', category: 'Literature', shelf: 'LT-04', available: 1, total: 3 },
  { title: 'Applied Probability', author: 'S. Bakshi', category: 'Mathematics', shelf: 'MA-07', available: 3, total: 3 },
]

const SAMPLE_LOANS: Array<{
  title: string
  member: string
  detail: string
  status: 'Issued' | 'Returned' | 'Overdue'
}> = [
  { title: 'Clean Architecture', member: 'M-2041', detail: 'due 12 Nov', status: 'Issued' },
  { title: 'Refactoring', member: 'M-1188', detail: 'overdue by 3 days', status: 'Overdue' },
  { title: 'The Pragmatic Programmer', member: 'M-0732', detail: 'returned 28 Oct', status: 'Returned' },
]

const SAMPLE_MY_LOANS: Array<{ title: string; detail: string; tone: BadgeTone; label: string }> = [
  { title: 'Introduction to Algorithms', detail: 'Due in 2 days', tone: 'warn', label: 'Due soon' },
  { title: 'Clean Code', detail: 'Due in 9 days', tone: 'success', label: 'On time' },
  { title: 'Python Crash Course', detail: 'Due today', tone: 'danger', label: 'Due today' },
]

const SAMPLE_RESERVATIONS: Array<{ title: string; status: string; tone: BadgeTone; meta: string }> = [
  { title: 'Design Patterns', status: 'Ready for pickup', tone: 'success', meta: 'collect by Fri' },
  { title: 'Refactoring', status: 'Position 2', tone: 'neutral', meta: 'expected 12 Nov' },
  { title: 'Domain-Driven Design', status: 'Position 3', tone: 'neutral', meta: 'expected 19 Nov' },
]

const SAMPLE_ISSUED = [42, 55, 38, 61, 49, 72, 58]
const SAMPLE_MONTHS = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']
const SAMPLE_CATEGORIES: Array<{ name: string; share: number }> = [
  { name: 'Computer Science', share: 38 },
  { name: 'Literature', share: 22 },
  { name: 'Mathematics', share: 16 },
]

const SAMPLE_MEMBERS: Array<{
  name: string
  id: string
  role: 'Student' | 'Faculty'
  status: 'Active' | 'Inactive'
  meta: string
}> = [
  { name: 'A. Sharma', id: 'M-2041', role: 'Student', status: 'Active', meta: '3 of 4 books · ₹0 fine' },
  { name: 'R. Iyer', id: 'F-0118', role: 'Faculty', status: 'Active', meta: '2 of 6 books · ₹0 fine' },
  { name: 'K. Menon', id: 'M-0732', role: 'Student', status: 'Inactive', meta: '0 of 4 books · ₹40 fine' },
]

/* ------------------------------------------------------------------ primitives */

function PreviewLine({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex min-w-0 items-center gap-2', className)}>{children}</div>
}

function PreviewCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-white/8 bg-ink-900/70 px-2.5 py-2', className)}>{children}</div>
  )
}

function PreviewHead({ icon: Icon, title, right }: { icon: typeof Search; title: string; right?: React.ReactNode }) {
  return (
    <PreviewLine className="justify-between pb-0.5">
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-fg-soft">
        <Icon className="size-3 shrink-0 text-brand-300" aria-hidden="true" />
        <span className="truncate">{title}</span>
      </span>
      {right}
    </PreviewLine>
  )
}

/** Every panel ends with this so nobody mistakes the preview for the live register. */
function SampleTag({ label = 'Sample data' }: { label?: string }) {
  return (
    <p className="pt-0.5 text-[9.5px] tracking-[0.1em] text-fg-faint uppercase" data-testid="preview-sample-tag">
      {label}
    </p>
  )
}

function availabilityTone(available: number, total: number): BadgeTone {
  if (available === 0) return 'danger'
  if (available <= Math.max(1, Math.floor(total * 0.34))) return 'warn'
  return 'success'
}

/* ------------------------------------------------------------------ panels */

function CataloguePreview({ liveBooks, catalogueCount }: { liveBooks: ApiBook[]; catalogueCount: number | null }) {
  const live = liveBooks.slice(0, 3)
  const rows = live.length
    ? live.map((book) => ({
        title: book.title,
        author: book.author || 'Unknown author',
        category: book.category || 'General',
        shelf: book.shelfLocation || '—',
        available: Number(book.availableCopies) || 0,
        total: Number(book.totalCopies) || 1,
      }))
    : SAMPLE_CATALOGUE

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-ink-900/80 px-2.5 py-1.5">
        <Search className="size-3 shrink-0 text-fg-faint" aria-hidden="true" />
        <span className="truncate text-[11px] text-fg-faint">Search title, author, ISBN…</span>
        <span
          className="ml-auto shrink-0 rounded bg-white/6 px-1.5 py-0.5 text-[9.5px] text-fg-muted tabular-nums"
          data-testid="feature-catalogue-count"
        >
          {catalogueCount !== null ? `${catalogueCount} titles` : 'catalogue'}
        </span>
      </div>

      <div className="space-y-1.5">
        {rows.map((row) => (
          <PreviewCard key={`${row.title}-${row.shelf}`}>
            <PreviewLine>
              <span className="grid size-6 shrink-0 place-items-center rounded bg-brand-500/12 text-brand-300">
                <BookOpen className="size-3" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] leading-tight font-medium text-fg">{row.title}</p>
                <p className="truncate text-[10px] leading-tight text-fg-faint">
                  {row.author} · {row.category} · {row.shelf}
                </p>
              </div>
              <StatusPill
                tone={availabilityTone(row.available, row.total)}
                label={`${row.available}/${row.total}`}
                className="shrink-0"
              />
            </PreviewLine>
          </PreviewCard>
        ))}
      </div>

      <SampleTag label={live.length ? 'Titles from the live catalogue · counts are public' : 'Sample data'} />
    </div>
  )
}

function CirculationPreview() {
  const onLoan = 12
  const overdue = 2
  return (
    <div className="space-y-2">
      <PreviewHead
        icon={ScanLine}
        title="Circulation desk"
        right={<span className="shrink-0 text-[9.5px] text-fg-faint tabular-nums">{onLoan} on loan</span>}
      />

      <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-ink-900/80 px-2.5 py-1.5">
        <ScanLine className="size-3 shrink-0 text-fg-faint" aria-hidden="true" />
        <span className="truncate text-[10.5px] text-fg-faint">Scan member card or book barcode…</span>
        <span className="ml-auto shrink-0 rounded bg-white/6 px-1.5 py-0.5 text-[9px] text-fg-muted">Issue</span>
      </div>

      <div className="space-y-1.5">
        {SAMPLE_LOANS.map((row) => {
          const tone: BadgeTone = row.status === 'Overdue' ? 'danger' : row.status === 'Returned' ? 'neutral' : 'success'
          return (
            <PreviewCard key={row.title}>
              <PreviewLine>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] leading-tight font-medium text-fg">{row.title}</p>
                  <p className="truncate text-[10px] leading-tight text-fg-faint">
                    {row.member} · {row.detail}
                  </p>
                </div>
                <Badge tone={tone} className="shrink-0 text-[9.5px]">
                  {row.status}
                </Badge>
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded border',
                    row.status === 'Returned'
                      ? 'border-white/8 text-fg-faint'
                      : 'border-brand-500/30 bg-brand-500/10 text-brand-300',
                  )}
                >
                  {row.status === 'Returned' ? (
                    <RefreshCw className="size-2.5" />
                  ) : (
                    <ScanLine className="size-2.5" />
                  )}
                </span>
              </PreviewLine>
            </PreviewCard>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand" className="text-[9.5px]">
          {onLoan} on loan
        </Badge>
        <Badge tone="danger" className="text-[9.5px]">
          <AlertTriangle className="size-2.5" aria-hidden="true" /> {overdue} overdue
        </Badge>
        <Badge tone="neutral" className="text-[9.5px]">
          3 due this week
        </Badge>
      </div>

      <SampleTag />
    </div>
  )
}

function SelfServicePreview() {
  return (
    <div className="space-y-2">
      <PreviewCard className="mx-auto max-w-[300px] px-3 py-2.5">
        <PreviewLine className="justify-between">
          <span className="text-[9.5px] tracking-[0.14em] text-fg-faint uppercase">My loans</span>
          <Badge tone="brand" className="text-[9.5px]">
            3 active
          </Badge>
        </PreviewLine>

        <div className="mt-1.5 space-y-1.5">
          {SAMPLE_MY_LOANS.map((loan) => (
            <div key={loan.title} className="rounded-lg border border-white/6 bg-ink-950/70 px-2 py-1.5">
              <p className="truncate text-[10.5px] leading-tight font-medium text-fg">{loan.title}</p>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-[9.5px] text-fg-faint">{loan.detail}</span>
                <Badge tone={loan.tone} className="shrink-0 text-[9px]">
                  {loan.label}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-brand-500/25 bg-brand-500/10 py-1.5 text-[10px] font-medium text-brand-200">
          <RefreshCw className="size-2.5" aria-hidden="true" />
          Renew loan
        </div>

        <div className="mt-2 flex items-center gap-1.5 border-t border-white/6 pt-1.5">
          <Heart className="size-2.5 shrink-0 text-violet-300" aria-hidden="true" />
          <span className="truncate text-[9.5px] text-fg-muted">Wishlist · 2 titles saved</span>
        </div>
      </PreviewCard>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <Badge tone="warn" className="text-[9.5px]">
          1 due soon
        </Badge>
        <Badge tone="success" className="text-[9.5px]">
          1 on time
        </Badge>
        <Badge tone="neutral" className="text-[9.5px]">
          Hold: Design Patterns · #1
        </Badge>
      </div>

      <SampleTag />
    </div>
  )
}

function ReservationsPreview() {
  return (
    <div className="space-y-2">
      <PreviewHead
        icon={Bookmark}
        title="Reservation queue"
        right={<span className="shrink-0 text-[9.5px] text-fg-faint">3 active holds</span>}
      />

      <div className="space-y-1.5">
        {SAMPLE_RESERVATIONS.map((row, index) => (
          <PreviewCard key={row.title}>
            <PreviewLine>
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold tabular-nums',
                  index === 0 ? 'bg-positive-500/20 text-positive-300' : 'bg-white/6 text-fg-muted',
                )}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] leading-tight font-medium text-fg">{row.title}</p>
                <p className="truncate text-[10px] leading-tight text-fg-faint">{row.meta}</p>
              </div>
              <Badge tone={row.tone} className="shrink-0 text-[9.5px]">
                {row.status}
              </Badge>
            </PreviewLine>
          </PreviewCard>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="success" className="text-[9.5px]">
          <CheckCircle2 className="size-2.5" aria-hidden="true" /> 1 ready to collect
        </Badge>
        <Badge tone="warn" className="text-[9.5px]">
          <Clock className="size-2.5" aria-hidden="true" /> Hold expires in 3 days
        </Badge>
      </div>

      <SampleTag />
    </div>
  )
}

function AnalyticsPreview() {
  const reduced = useReducedMotion()
  const max = Math.max(...SAMPLE_ISSUED)
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: 'Issued this month', value: '72', tone: 'text-fg' },
          { label: 'Overdue', value: '9', tone: 'text-danger-400' },
          { label: 'Returns on time', value: '94%', tone: 'text-positive-400' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-white/8 bg-ink-900/70 px-2 py-1.5">
            <p className={cn('text-[13.5px] leading-none font-semibold tabular-nums', stat.tone)}>{stat.value}</p>
            <p className="mt-1 text-[9px] leading-tight text-fg-faint">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-white/8 bg-ink-900/70 px-2.5 py-2">
        <div className="flex items-end justify-between gap-1.5">
          {SAMPLE_ISSUED.map((value, index) => {
            const barHeight = Math.max(8, Math.round((value / max) * 46))
            return (
            <div key={SAMPLE_MONTHS[index]} className="flex flex-1 flex-col justify-end gap-1">
              <motion.div
                className="w-full rounded-t bg-gradient-to-t from-brand-600/50 to-brand-400"
                style={{ height: barHeight }}
                initial={reduced ? false : { height: 0 }}
                animate={{ height: barHeight }}
                transition={reduced ? { duration: 0 } : { duration: 0.5, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
              />
              <span className="text-center text-[8px] text-fg-faint">{SAMPLE_MONTHS[index]}</span>
            </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-1.5 rounded-lg border border-white/8 bg-ink-900/70 px-2.5 py-2">
        <p className="text-[9px] tracking-[0.12em] text-fg-faint uppercase">Popular categories</p>
        {SAMPLE_CATEGORIES.map((category) => (
          <div key={category.name} className="flex items-center gap-2">
            <span className="w-[92px] shrink-0 truncate text-[10px] text-fg-muted">{category.name}</span>
            <Progress value={category.share} max={100} tone="brand" className="h-1 flex-1" />
            <span className="shrink-0 text-[9.5px] text-fg-faint tabular-nums">{category.share}%</span>
          </div>
        ))}
      </div>

      <SampleTag label="Sample figures · not live statistics" />
    </div>
  )
}

function MembersPreview() {
  return (
    <div className="space-y-2">
      <PreviewHead
        icon={Users}
        title="Members"
        right={<span className="shrink-0 text-[9.5px] text-fg-faint">128 registered</span>}
      />

      <div className="space-y-1.5">
        {SAMPLE_MEMBERS.map((member, index) => (
          <PreviewCard key={member.id}>
            <PreviewLine>
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-[8.5px] font-bold text-white/90',
                  index === 0 ? 'bg-brand-500/70' : index === 1 ? 'bg-violet-500/70' : 'bg-cyan-500/60',
                )}
                aria-hidden="true"
              >
                {member.name.replace('.', '').slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] leading-tight font-medium text-fg">
                  {member.name} <span className="text-fg-faint">· {member.id}</span>
                </p>
                <p className="truncate text-[10px] leading-tight text-fg-faint">{member.meta}</p>
              </div>
              <Badge tone={member.role === 'Faculty' ? 'violet' : 'cyan'} className="shrink-0 text-[9px]">
                {member.role}
              </Badge>
              <Badge
                tone={member.status === 'Active' ? 'success' : 'neutral'}
                dot
                className="shrink-0 text-[9px]"
              >
                {member.status}
              </Badge>
            </PreviewLine>
          </PreviewCard>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" className="text-[9.5px]">
          <LibraryBig className="size-2.5" aria-hidden="true" /> 4-book student limit
        </Badge>
        <Badge tone="warn" className="text-[9.5px]">
          1 outstanding fine
        </Badge>
      </div>

      <SampleTag label="Fictional members · masked IDs" />
    </div>
  )
}

/* ------------------------------------------------------------------ dispatcher */

export function FeaturePreview({
  variant,
  liveBooks,
  catalogueCount,
}: {
  variant: string
  liveBooks: ApiBook[]
  catalogueCount: number | null
}) {
  switch (variant) {
    case 'catalog':
      return <CataloguePreview liveBooks={liveBooks} catalogueCount={catalogueCount} />
    case 'circulation':
      return <CirculationPreview />
    case 'selfservice':
      return <SelfServicePreview />
    case 'reservations':
      return <ReservationsPreview />
    case 'analytics':
      return <AnalyticsPreview />
    case 'members':
      return <MembersPreview />
    default:
      return null
  }
}
