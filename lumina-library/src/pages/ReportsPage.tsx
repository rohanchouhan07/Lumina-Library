import { IS_API_CONFIGURED } from '@/config/env'
import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Info, TrendingUp } from 'lucide-react'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { useAnalytics } from '@/hooks/useAnalytics'
import { getLibraryStats, memberOutstandingFines } from '@/features/library/engine'
import { exportBooksCsv, exportLoansCsv, exportMembersCsv, exportReservationsCsv } from '@/lib/exportUtils'
import {
  formatMonthKeyLong,
  lastMonths,
} from '@/lib/dateUtils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Field'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Progress, InlineAlert, EmptyState } from '@/components/ui/Feedback'
import { MenuItem, Popover } from '@/components/ui/Menu'
import {
  AvailabilityChart,
  ChartFrame,
  CategoryDonut,
  OverdueLineChart,
  PopularBooksChart,
  TrendAreaChart,
  CHART_COLORS,
} from '@/components/charts/ChartKit'
import { AnimatedNumber } from '@/components/animation/Reveal'
import { Avatar } from '@/components/ui/Avatar'
import { formatINR } from '@/lib/utils'
import { Link } from 'react-router-dom'

export function ReportsPage() {
  const { data } = useLibrary()
  const { can, mode } = useAuth()
  const toast = useToast()
  const [months, setMonths] = useState(6)
  const [category, setCategory] = useState('all')

  const analytics = useAnalytics(data, { months, category })

  const categories = useMemo(
    () => Array.from(new Set(data.books.map((book) => book.category))).sort(),
    [data.books],
  )

  const fineLeaders = useMemo(
    () =>
      data.members
        .map((member) => ({ member, fines: memberOutstandingFines(data, member.id) }))
        .filter((entry) => entry.fines > 0)
        .sort((a, b) => b.fines - a.fines)
        .slice(0, 5),
    [data],
  )

  const inventoryStats = getLibraryStats(data)

  if (!can('reports.view')) {
    return (
      <EmptyState
        title="Reports are restricted"
        description="Analytics are limited to administrators and librarians. Sign in with a staff role to review circulation analytics."
        action={
          <Link to="/login">
            <Button variant="secondary">Back to sign in</Button>
          </Link>
        }
      />
    )
  }

  const exportAll = () => {
    exportBooksCsv(data.books, data)
    exportMembersCsv(data.members, data)
    exportLoansCsv(data.loans, data)
    exportReservationsCsv(data)
    toast.success('Exports generated', 'Four CSV files were downloaded from the current dataset.')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Analytics"
        title="Reports & insights"
        description={
          IS_API_CONFIGURED
            ? 'Circulation, membership and inventory analytics computed from the connected library.'
            : 'Circulation, membership and inventory analytics computed live from the demo dataset.'
        }
        actions={
          <>
            <Select
              value={String(months)}
              onChange={(event) => setMonths(Number(event.target.value))}
              aria-label="Date range"
              className="w-auto min-w-28"
            >
              <option value="3">Last 3 months</option>
              <option value="6">Last 6 months</option>
              <option value="12">Last 12 months</option>
            </Select>
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Category filter"
              className="w-auto min-w-36"
            >
              <option value="all">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Popover
              label="Export data"
              trigger={({ toggle, ref, open }) => (
                <Button
                  ref={ref}
                  variant="secondary"
                  size="sm"
                  leftIcon={<Download />}
                  aria-expanded={open}
                  onClick={toggle}
                >
                  Export
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={<FileSpreadsheet />}
                    onClick={() => {
                      exportBooksCsv(data.books, data)
                      close()
                    }}
                  >
                    Book inventory CSV
                  </MenuItem>
                  <MenuItem
                    icon={<FileSpreadsheet />}
                    onClick={() => {
                      exportMembersCsv(data.members, data)
                      close()
                    }}
                  >
                    Members CSV
                  </MenuItem>
                  <MenuItem
                    icon={<FileSpreadsheet />}
                    onClick={() => {
                      exportLoansCsv(data.loans, data)
                      close()
                    }}
                  >
                    Circulation CSV
                  </MenuItem>
                  <MenuItem
                    icon={<FileSpreadsheet />}
                    onClick={() => {
                      exportReservationsCsv(data)
                      close()
                    }}
                  >
                    Reservations CSV
                  </MenuItem>
                  <MenuItem
                    icon={<Download />}
                    onClick={() => {
                      exportAll()
                      close()
                    }}
                  >
                    All datasets
                  </MenuItem>
                </>
              )}
            </Popover>
          </>
        }
      />

      <InlineAlert tone="info">
        {mode === 'live' ? 'All figures are computed from the records in the library spreadsheet' : 'All figures are generated from the seeded demo records'} ({data.books.length} titles, {data.members.length}{' '}
        members, {data.loans.length} loans). They are sample values for this prototype, not institutional statistics.
      </InlineAlert>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Loans issued', value: analytics.totalIssued, hint: `in ${months} months` },
          { label: 'Loans returned', value: analytics.totalReturned, hint: `${analytics.lateRate}% returned late` },
          { label: 'Active loans', value: inventoryStats.activeLoans, hint: `${inventoryStats.utilisation}% utilisation` },
          { label: 'Overdue now', value: inventoryStats.overdueLoans, hint: 'needs follow-up' },
          { label: 'Members', value: inventoryStats.totalMembers, hint: `${inventoryStats.students} students` },
          { label: 'Simulated fines', value: inventoryStats.outstandingFines, hint: 'simulated ₹', prefix: '₹' },
        ].map((item) => (
          <div key={item.label} className="surface-card rounded-xl p-3">
            <p className="text-[11px] text-fg-muted">{item.label}</p>
            <p className="mt-1 text-[20px] leading-none font-semibold tracking-tight text-fg">
              <AnimatedNumber value={item.value} prefix={item.prefix} />
            </p>
            <p className="mt-1 text-[10.5px] text-fg-faint">{item.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartFrame
          title="Issue & return trend"
          description={`Monthly circulation · ${formatMonthKeyLong(analytics.buckets[0].key)} – ${formatMonthKeyLong(analytics.buckets[analytics.buckets.length - 1].key)}`}
          className="xl:col-span-2"
          height={260}
          isEmpty={!analytics.hasData}
          summary={analytics.circulation
            .map((month) => `${month.month}: ${month.issued} issued, ${month.returned} returned`)
            .join('; ')}
        >
          <AvailabilityChart data={analytics.circulation} />
        </ChartFrame>

        <ChartFrame
          title="Copies by category"
          description="Active collection distribution"
          height={260}
          isEmpty={analytics.categories.length === 0}
        >
          <CategoryDonut data={analytics.categories} />
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartFrame
          title="Overdue trend"
          description="Loans that passed their due date each month"
          height={230}
          isEmpty={!analytics.hasData}
          summary={`Overdue counts by month: ${analytics.circulation.map((m) => `${m.month} ${m.overdue}`).join(', ')}`}
        >
          <OverdueLineChart data={analytics.circulation} />
        </ChartFrame>

        <ChartFrame
          title="Monthly volume"
          description="Issued versus returned"
          height={230}
          isEmpty={analytics.totalIssued === 0}
        >
          <TrendAreaChart data={analytics.circulation} dataKey="issued" name="Issued" color={CHART_COLORS.brand} />
        </ChartFrame>

        <ChartFrame
          title="Membership growth"
          description="Cumulative registered members"
          height={230}
          isEmpty={analytics.membership.every((m) => m.total === 0)}
        >
          <TrendAreaChart data={analytics.membership} dataKey="total" name="Members" color={CHART_COLORS.cyan} />
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Most borrowed titles"
          description="Top six titles by loan count in range"
          height={240}
          isEmpty={analytics.popular.length === 0}
          summary={analytics.popular.map((book) => `${book.fullTitle}: ${book.count}`).join(', ')}
        >
          <PopularBooksChart data={analytics.popular} />
        </ChartFrame>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Inventory availability</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-fg-muted">
                {category === 'all' ? 'All categories' : category} · derived from active loans
              </p>
            </div>
            <Badge tone="outline">{inventoryStats.utilisation}% out</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total', value: analytics.inventory.total },
                { label: 'On loan', value: analytics.inventory.onLoan },
                { label: 'Available', value: analytics.inventory.available },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-white/8 bg-ink-950/40 px-2.5 py-2">
                  <p className="text-[10px] tracking-[0.06em] text-fg-faint uppercase">{item.label}</p>
                  <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-fg">{item.value}</p>
                </div>
              ))}
            </div>
            <Progress
              value={analytics.inventory.onLoan}
              max={Math.max(1, analytics.inventory.total)}
              label="Copies currently on loan"
              showValue
              tone={analytics.inventory.available === 0 ? 'danger' : 'brand'}
            />
            <div className="space-y-2 pt-1">
              {analytics.categories.slice(0, 5).map((entry, index) => {
                const categoryTitles = data.books.filter((book) => book.category === entry.category)
                const availableCopies = categoryTitles.reduce((sum, book) => {
                  const onLoan = data.loans.filter((loan) => loan.bookId === book.id && loan.status === 'active').length
                  return sum + Math.max(0, book.totalCopies - onLoan)
                }, 0)
                return (
                  <div key={entry.category}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-fg-soft">{entry.category}</span>
                      <span className="text-fg-faint tabular-nums">
                        {availableCopies}/{entry.copies} available
                      </span>
                    </div>
                    <Progress
                      value={availableCopies}
                      max={Math.max(1, entry.copies)}
                      tone={(['brand', 'violet', 'cyan', 'success', 'warn'] as const)[index % 5]}
                    />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Loan status breakdown</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-fg-muted">Every loan record in the dataset</p>
            </div>
            <TrendingUp className="size-4 text-fg-faint" aria-hidden="true" />
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.loansByStatus.map((entry, index) => (
              <div key={entry.name}>
                <div className="mb-1 flex items-center justify-between text-[11.5px]">
                  <span className="text-fg-soft">{entry.name}</span>
                  <span className="text-fg-faint tabular-nums">{entry.value} loans</span>
                </div>
                <Progress
                  value={entry.value}
                  max={Math.max(1, analytics.loansByStatus.reduce((sum, item) => sum + item.value, 0))}
                  tone={(['brand', 'success', 'danger'] as const)[index] ?? 'brand'}
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
              <Metric label="On-time returns" value={`${analytics.lateRate === 0 ? 100 : 100 - analytics.lateRate}%`} />
              <Metric label="Late returns" value={`${analytics.lateRate}%`} />
              <Metric label="Total simulated fines" value={formatINR(inventoryStats.outstandingFines)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Members with fines</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-fg-muted">Simulated amounts</p>
            </div>
          </CardHeader>
          <CardContent>
            {fineLeaders.length === 0 ? (
              <EmptyState compact icon={<Info />} title="No outstanding fines" />
            ) : (
              <ul className="space-y-1.5">
                {fineLeaders.map(({ member, fines }) => (
                  <li key={member.id} className="flex items-center gap-2.5 py-1">
                    <Avatar name={member.name} size="xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] text-fg-soft">{member.name}</p>
                      <p className="text-[10px] text-fg-faint">{member.id}</p>
                    </div>
                    <Badge tone="warn">₹{fines}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-fg-faint">
        Reporting window: {lastMonths(months).length} months · generated {new Date().toLocaleDateString('en-IN')} ·
        CSV exports contain the full dataset, not only the current filter, unless noted.
      </p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-2">
      <p className="text-[10px] tracking-[0.06em] text-fg-faint uppercase">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-fg">{value}</p>
    </div>
  )
}
