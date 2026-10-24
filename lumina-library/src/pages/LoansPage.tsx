import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BookOpen,
  CalendarClock,
  Download,
  RefreshCcw,
  RotateCcw,
  ScanLine,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import type { Loan } from '@/types'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import {
  canRenew,
  loanFine,
  memberOutstandingFines,
} from '@/features/library/engine'
import { exportLoansCsv } from '@/lib/exportUtils'
import { daysUntil, formatDate, isToday, overdueDays } from '@/lib/dateUtils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SearchInput } from '@/components/ui/Field'
import { Tabs } from '@/components/ui/Tabs'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/Feedback'
import { Avatar } from '@/components/ui/Avatar'
import { BookCover } from '@/components/books/BookCover'
import { LoanStatusPill, FineTag } from '@/components/circulation/StatusBits'
import { IssueDialog } from '@/components/circulation/IssueDialog'
import { ReturnDialog } from '@/components/circulation/ReturnDialog'
import { cn } from '@/lib/utils'

type TabValue = 'active' | 'overdue' | 'due-today' | 'returned' | 'all'

export function LoansPage() {
  const { data, renewLoan } = useLibrary()
  const { member, can } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<TabValue>(() => {
    const status = searchParams.get('status')
    return status === 'overdue' ? 'overdue' : 'active'
  })
  const [query, setQuery] = useState('')
  const [issueOpen, setIssueOpen] = useState(false)
  const [returnTarget, setReturnTarget] = useState<Loan | null>(null)

  const staffView = can('loans.viewAll')
  const canIssue = can('loans.issue')
  const canReturn = can('loans.return')

  useEffect(() => {
    if (searchParams.get('issue') && canIssue) {
      setIssueOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('issue')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, canIssue, setSearchParams])

  const scoped = useMemo(
    () => (staffView ? data.loans : data.loans.filter((loan) => loan.memberId === member?.id)),
    [data.loans, staffView, member?.id],
  )

  const counts = useMemo(() => {
    const active = scoped.filter((loan) => loan.status === 'active')
    return {
      active: active.length,
      overdue: active.filter((loan) => overdueDays(loan.dueAt) > 0).length,
      dueToday: active.filter((loan) => isToday(loan.dueAt)).length,
      returned: scoped.filter((loan) => loan.status === 'returned').length,
      all: scoped.length,
    }
  }, [scoped])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return scoped
      .filter((loan) => {
        if (tab === 'active') return loan.status === 'active'
        if (tab === 'returned') return loan.status === 'returned'
        if (tab === 'overdue') return loan.status === 'active' && overdueDays(loan.dueAt) > 0
        if (tab === 'due-today') return loan.status === 'active' && isToday(loan.dueAt)
        return true
      })
      .filter((loan) => {
        if (!term) return true
        const book = data.books.find((item) => item.id === loan.bookId)
        const borrower = data.members.find((item) => item.id === loan.memberId)
        return (
          book?.title.toLowerCase().includes(term) ||
          borrower?.name.toLowerCase().includes(term) ||
          loan.id.toLowerCase().includes(term) ||
          loan.memberId.toLowerCase().includes(term)
        )
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      })
  }, [scoped, tab, query, data.books, data.members])

  const fines = member ? memberOutstandingFines(data, member.id) : 0

  const handleRenew = async (loan: Loan) => {
    const result = await renewLoan(loan.id)
    if (!result.ok) {
      toast.error('Renewal not possible', result.error)
      return
    }
    toast.success('Loan renewed', `New due date: ${formatDate(result.value.dueAt)}.`)
  }

  const tabItems: { value: TabValue; label: string; count: number }[] = [
    { value: 'active', label: 'Active', count: counts.active },
    { value: 'overdue', label: 'Overdue', count: counts.overdue },
    { value: 'due-today', label: 'Due today', count: counts.dueToday },
    { value: 'returned', label: 'Returned', count: counts.returned },
    { value: 'all', label: 'All', count: counts.all },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={staffView ? 'Circulation desk' : 'My borrowing'}
        title={staffView ? 'Issue, return & renew' : 'My loans'}
        description={
          staffView
            ? 'Every loan in the library with eligibility checks, fine calculation and renewal rules enforced.'
            : 'Titles you currently hold, their due dates and any simulated fines.'
        }
        actions={
          <>
            {can('reports.export') && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download />}
                onClick={() => {
                  exportLoansCsv(filtered, data)
                  toast.success('Circulation exported', `${filtered.length} loan records written to CSV.`)
                }}
              >
                Export
              </Button>
            )}
            {canIssue && (
              <Button size="sm" leftIcon={<ScanLine />} onClick={() => setIssueOpen(true)}>
                Issue book
              </Button>
            )}
          </>
        }
      />

      {!staffView && fines > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn-500/20 bg-warn-500/[0.06] px-3.5 py-2.5">
          <TriangleAlert className="size-4 text-warn-400" aria-hidden="true" />
          <p className="text-[12.5px] text-fg-soft">
            You have <strong className="text-warn-400">₹{fines}</strong> in simulated overdue fines.
          </p>
          <span className="text-[11px] text-fg-faint">Calculated at ₹{data.config.finePerDay}/day — simulated, never charged.</span>
        </div>
      )}

      <div className="surface-card flex flex-col gap-2.5 rounded-xl p-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs<TabValue> aria-label="Filter loans" value={tab} onChange={setTab} items={tabItems} />
        <div className="flex items-center gap-2">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery('')}
            placeholder={staffView ? 'Search book, member or loan ID…' : 'Search your loans…'}
            aria-label="Search loans"
            className="w-full sm:w-64"
          />
          {query && (
            <Button variant="ghost" size="sm" leftIcon={<RotateCcw />} onClick={() => setQuery('')}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={tab === 'overdue' ? <TriangleAlert /> : <BookOpen />}
          title={
            tab === 'overdue'
              ? 'No overdue loans'
              : tab === 'due-today'
                ? 'No returns due today'
                : tab === 'returned'
                  ? 'No returned loans yet'
                  : 'No loans to show'
          }
          description={
            staffView
              ? 'Issue a book from the desk to start a circulation record.'
              : 'Borrow a title from the catalogue to see it here.'
          }
          action={
            canIssue ? (
              <Button size="sm" onClick={() => setIssueOpen(true)} leftIcon={<ScanLine />}>
                Issue a book
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
                  <Th>Book</Th>
                  {staffView && <Th>Borrower</Th>}
                  <Th>Issued</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th className="text-center">Renewals</Th>
                  <Th className="text-right">Simulated fine</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((loan) => {
                  const book = data.books.find((item) => item.id === loan.bookId)
                  const borrower = data.members.find((item) => item.id === loan.memberId)
                  const renewable = canRenew(data, loan)
                  const fine = loanFine(loan, data.config)
                  return (
                    <Tr key={loan.id}>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          {book && (
                            <div className="w-7 shrink-0 overflow-hidden rounded shadow-book">
                              <BookCover book={book} size="xs" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="max-w-[220px] truncate font-medium text-fg">{book?.title ?? loan.bookId}</p>
                            <p className="text-[10.5px] text-fg-faint">{loan.id}</p>
                          </div>
                        </div>
                      </Td>
                      {staffView && (
                        <Td>
                          <div className="flex items-center gap-2">
                            <Avatar name={borrower?.name ?? 'Unknown'} size="xs" />
                            <div className="min-w-0">
                              <p className="max-w-[140px] truncate text-[12px] text-fg-soft">{borrower?.name}</p>
                              <p className="text-[10px] text-fg-faint">{borrower?.id}</p>
                            </div>
                          </div>
                        </Td>
                      )}
                      <Td className="text-[11.5px] whitespace-nowrap text-fg-muted">{formatDate(loan.issuedAt)}</Td>
                      <Td className="text-[11.5px] whitespace-nowrap">
                        <span className={overdueDays(loan.dueAt) > 0 && loan.status === 'active' ? 'text-danger-400' : ''}>
                          {formatDate(loan.dueAt)}
                        </span>
                        {loan.status === 'active' && daysUntil(loan.dueAt) >= 0 && daysUntil(loan.dueAt) <= 3 && (
                          <span className="ml-1 text-[10px] text-warn-400">
                            {daysUntil(loan.dueAt) === 0 ? '(today)' : `(${daysUntil(loan.dueAt)}d)`}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <LoanStatusPill loan={loan} />
                      </Td>
                      <Td className="text-center text-[11.5px] tabular-nums text-fg-muted">
                        {loan.renewals}/{data.config.maxRenewals}
                      </Td>
                      <Td className="text-right">
                        <FineTag amount={fine} muted={loan.status === 'returned'} />
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1.5">
                          {loan.status === 'active' && (
                            <>
                              <Button
                                size="xs"
                                variant="ghost"
                                leftIcon={<RefreshCcw />}
                                disabled={!renewable.ok}
                                title={renewable.ok ? 'Renew this loan' : renewable.error}
                                onClick={() => handleRenew(loan)}
                              >
                                Renew
                              </Button>
                              {canReturn && (
                                <Button size="xs" variant="secondary" leftIcon={<Undo2 />} onClick={() => setReturnTarget(loan)}>
                                  Return
                                </Button>
                              )}
                            </>
                          )}
                          {loan.status === 'returned' && (
                            <span className="text-[10.5px] text-fg-faint">
                              Returned {formatDate(loan.returnedAt)}
                            </span>
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
            {filtered.map((loan) => {
              const book = data.books.find((item) => item.id === loan.bookId)
              const borrower = data.members.find((item) => item.id === loan.memberId)
              const renewable = canRenew(data, loan)
              const fine = loanFine(loan, data.config)
              return (
                <li key={loan.id} className="surface-card rounded-xl p-3">
                  <div className="flex items-start gap-2.5">
                    {book && (
                      <div className="w-8 shrink-0 overflow-hidden rounded shadow-book">
                        <BookCover book={book} size="xs" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-fg">{book?.title}</p>
                      <p className="truncate text-[11px] text-fg-muted">
                        {staffView ? `${borrower?.name} · ` : ''}
                        {loan.id}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <LoanStatusPill loan={loan} />
                        <span className="text-[10.5px] text-fg-faint">
                          Due {formatDate(loan.dueAt)}
                        </span>
                        {fine > 0 && <FineTag amount={fine} muted={loan.status === 'returned'} />}
                      </div>
                    </div>
                  </div>
                  {loan.status === 'active' && (
                    <div className="mt-2.5 flex gap-2">
                      <Button
                        size="xs"
                        variant="secondary"
                        className="flex-1"
                        leftIcon={<RefreshCcw />}
                        disabled={!renewable.ok}
                        onClick={() => handleRenew(loan)}
                      >
                        Renew
                      </Button>
                      {canReturn && (
                        <Button size="xs" className="flex-1" leftIcon={<Undo2 />} onClick={() => setReturnTarget(loan)}>
                          Return
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-faint">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3" aria-hidden="true" />
          Loan period {data.config.loanDurationDays} days · up to {data.config.maxRenewals} renewals of{' '}
          {data.config.renewalExtensionDays} days
        </span>
        <span className={cn('inline-flex items-center gap-1')}>
          <Badge tone="outline">₹{data.config.finePerDay}/day</Badge>
          simulated overdue fine
        </span>
      </div>

      <IssueDialog open={issueOpen} onOpenChange={setIssueOpen} />
      <ReturnDialog loan={returnTarget} open={Boolean(returnTarget)} onOpenChange={(open) => !open && setReturnTarget(null)} />
    </div>
  )
}
