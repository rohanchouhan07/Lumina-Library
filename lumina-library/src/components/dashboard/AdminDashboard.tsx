import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookCopy,
  BookMarked,
  BookPlus,
  Bookmark,
  CircleDollarSign,
  FileSpreadsheet,
  LibraryBig,
  TriangleAlert,
  Users,
  UserPlus,
} from 'lucide-react'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { PageHeader } from '@/components/layout/PageHeader'
import { StatCard } from './StatCard'
import { Stagger, StaggerItem } from '@/components/animation/Reveal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ChartFrame, CirculationChart, CategoryDonut } from '@/components/charts/ChartKit'
import { useAnalytics } from '@/hooks/useAnalytics'
import { ActivityFeed } from '@/components/circulation/ActivityFeed'
import { BookCover } from '@/components/books/BookCover'
import { formatDate, formatMonthKeyLong, overdueDays } from '@/lib/dateUtils'
import { mostBorrowedBooks } from '@/features/library/engine'
import { EmptyState } from '@/components/ui/Feedback'
import { exportBooksCsv, exportLoansCsv } from '@/lib/exportUtils'
import { useToast } from '@/providers/ToastProvider'

export function AdminDashboard() {
  const { data, stats } = useLibrary()
  const { member, mode } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const analytics = useAnalytics(data, { months: 6, category: 'all' })
  const popular = mostBorrowedBooks(data, 5)
  const overdue = data.loans
    .filter((loan) => loan.status === 'active' && overdueDays(loan.dueAt) > 0)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 4)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administrator overview"
        title={`${greeting}, ${member?.name.replace(/^(Dr\.|Prof\.|Mr\.|Ms\.)\s+/, '').split(' ')[0] ?? 'there'}`}
        description={`A single view of inventory, membership and circulation ${mode === 'live' ? 'across the connected library' : 'across the demo library'}.`}
        actions={
          <>
            <Button variant="secondary" size="sm" leftIcon={<FileSpreadsheet />} onClick={() => {
              exportBooksCsv(data.books, data)
              toast.success('Inventory exported', 'CSV generated from the current dataset.')
            }}>
              Export
            </Button>
            <Button size="sm" leftIcon={<BookPlus />} onClick={() => navigate('/app/books?new=1')}>
              Add book
            </Button>
          </>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Total copies', value: stats.totalCopies, icon: BookCopy, tone: 'brand' as const, hint: `${stats.totalTitles} titles` },
          { label: 'Unique titles', value: stats.activeTitles, icon: LibraryBig, tone: 'violet' as const, hint: `${stats.archivedTitles} archived` },
          { label: 'Students', value: stats.students, icon: Users, tone: 'cyan' as const, hint: `${stats.activeMembers} active members` },
          { label: 'Active loans', value: stats.activeLoans, icon: BookMarked, tone: 'success' as const, hint: `${stats.utilisation}% of copies out` },
          { label: 'Overdue', value: stats.overdueLoans, icon: TriangleAlert, tone: 'danger' as const, hint: 'Needs follow-up' },
          { label: 'Pending holds', value: stats.pendingReservations, icon: Bookmark, tone: 'warn' as const, hint: `${stats.readyReservations} ready` },
        ].map((item) => (
          <StaggerItem key={item.label}>
            <StatCard {...item} />
          </StaggerItem>
        ))}
      </Stagger>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartFrame
          title="Monthly circulation"
          description="Issues and returns across the last six months"
          className="xl:col-span-2"
          height={252}
          isEmpty={!analytics.hasData}
          summary={`Issued ${analytics.circulation.reduce((s, m) => s + m.issued, 0)} and returned ${analytics.circulation.reduce((s, m) => s + m.returned, 0)} loans over six months.`}
          action={<Badge tone="outline">{mode === 'live' ? 'Supabase' : 'Demo data'}</Badge>}
        >
          <CirculationChart data={analytics.circulation} />
        </ChartFrame>

        <ChartFrame
          title="Copies by category"
          description="Where the collection is concentrated"
          height={252}
          isEmpty={analytics.categories.length === 0}
        >
          <CategoryDonut data={analytics.categories} />
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="items-center">
            <CardTitle>Recent activity</CardTitle>
            <Button variant="ghost" size="xs" rightIcon={<ArrowRight />} onClick={() => navigate('/app/reports')}>
              View reports
            </Button>
          </CardHeader>
          <CardContent>
            <ActivityFeed entries={data.activity} limit={6} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Popular this term</CardTitle>
            <Badge tone="outline">By loans</Badge>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {popular.length === 0 ? (
              <EmptyState compact title="No circulation yet" />
            ) : (
              popular.map(({ book, count }, index) => (
                <button
                  key={book.id}
                  type="button"
                  onClick={() => navigate(`/app/books?book=${book.id}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <span className="w-3.5 shrink-0 text-[11px] font-semibold text-fg-faint tabular-nums">
                    {index + 1}
                  </span>
                  <div className="w-8 shrink-0 overflow-hidden rounded shadow-book">
                    <BookCover book={book} size="xs" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-fg">{book.title}</p>
                    <p className="truncate text-[10.5px] text-fg-faint">{book.author}</p>
                  </div>
                  <Badge tone="cyan">{count}</Badge>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="items-center">
            <div>
              <CardTitle>Overdue attention</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-fg-muted">Simulated fines accrue at ₹{data.config.finePerDay}/day</p>
            </div>
            <Button variant="ghost" size="xs" rightIcon={<ArrowRight />} onClick={() => navigate('/app/loans?status=overdue')}>
              All overdue
            </Button>
          </CardHeader>
          <CardContent>
            {overdue.length === 0 ? (
              <EmptyState compact title="No overdue loans" description="Every borrowed title is within its due date." />
            ) : (
              <ul className="space-y-1.5">
                {overdue.map((loan) => {
                  const book = data.books.find((item) => item.id === loan.bookId)
                  const borrower = data.members.find((item) => item.id === loan.memberId)
                  const days = overdueDays(loan.dueAt)
                  return (
                    <li
                      key={loan.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-danger-500/15 bg-danger-500/[0.045] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-fg">{book?.title}</p>
                        <p className="truncate text-[10.5px] text-fg-muted">
                          {borrower?.name} · due {formatDate(loan.dueAt)}
                        </p>
                      </div>
                      <Badge tone="danger">
                        {days}d late · ₹{days * data.config.finePerDay}
                      </Badge>
                      <Button size="xs" variant="secondary" onClick={() => navigate('/app/loans?status=overdue')}>
                        Review
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
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { label: 'Issue book', icon: BookMarked, to: '/app/loans?issue=1' },
              { label: 'Register member', icon: UserPlus, to: '/app/members?new=1' },
              { label: 'Add title', icon: BookPlus, to: '/app/books?new=1' },
              { label: 'Fines report', icon: CircleDollarSign, to: '/app/reports' },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => navigate(action.to)}
                className="group flex flex-col gap-2 rounded-lg border border-white/8 bg-white/[0.025] p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.045]"
              >
                <action.icon className="size-4 text-brand-300" aria-hidden="true" />
                <span className="text-[11.5px] font-medium text-fg-soft group-hover:text-fg">{action.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                exportLoansCsv(data.loans, data)
                toast.success('Circulation exported', 'CSV generated from all loan records.')
              }}
              className="col-span-2 rounded-lg border border-white/8 bg-white/[0.025] px-2.5 py-2 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-white/16 hover:text-fg"
            >
              Export circulation CSV
            </button>
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-fg-faint">
        Snapshot generated {formatDate(new Date().toISOString())} · period {formatMonthKeyLong(analytics.buckets[0].key)} –{' '}
        {formatMonthKeyLong(analytics.buckets[analytics.buckets.length - 1].key)} ·{' '}
        {mode === 'live'
          ? 'figures read from Supabase PostgreSQL through the role-checked API'
          : 'all figures come from the local demo dataset'}.
      </p>
    </div>
  )
}
