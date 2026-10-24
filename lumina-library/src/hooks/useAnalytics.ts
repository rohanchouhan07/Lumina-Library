import { useMemo } from 'react'
import { format, startOfMonth, subMonths } from 'date-fns'
import type { LibraryData } from '@/types'
import { getAvailability, isLoanOverdue } from '@/features/library/engine'
import { overdueDays } from '@/lib/dateUtils'

export interface AnalyticsRange {
  months: number
  category: string
}

export function useAnalytics(data: LibraryData, { months, category }: AnalyticsRange) {
  return useMemo(() => {
    const now = new Date()
    const buckets = Array.from({ length: months }).map((_, index) => {
      const date = startOfMonth(subMonths(now, months - 1 - index))
      return { key: format(date, 'yyyy-MM'), label: format(date, 'MMM') }
    })

    const inCategory = (bookId: string) => {
      if (category === 'all') return true
      const book = data.books.find((item) => item.id === bookId)
      return book?.category === category
    }

    const scopedLoans = data.loans.filter((loan) => inCategory(loan.bookId))

    const circulation = buckets.map((bucket) => {
      const issued = scopedLoans.filter((loan) => loan.issuedAt.slice(0, 7) === bucket.key).length
      const returned = scopedLoans.filter(
        (loan) => loan.returnedAt && loan.returnedAt.slice(0, 7) === bucket.key,
      ).length
      const overdue = scopedLoans.filter((loan) => {
        if (!loan.dueAt.startsWith(bucket.key)) return false
        return loan.status === 'active'
          ? overdueDays(loan.dueAt) > 0
          : Boolean(loan.returnedAt && new Date(loan.returnedAt) > new Date(loan.dueAt))
      }).length
      return { month: bucket.label, key: bucket.key, issued, returned, overdue }
    })

    const membership = buckets.map((bucket) => {
      const monthEnd = new Date(`${bucket.key}-28T23:59:59`)
      const total = data.members.filter((member) => new Date(member.joinedAt) <= monthEnd).length
      const joined = data.members.filter((member) => member.joinedAt.slice(0, 7) === bucket.key).length
      return { month: bucket.label, key: bucket.key, total, joined }
    })

    const categoryCounts = data.books
      .filter((book) => book.status === 'active')
      .reduce<Record<string, number>>((acc, book) => {
        acc[book.category] = (acc[book.category] ?? 0) + book.totalCopies
        return acc
      }, {})

    const categories = Object.entries(categoryCounts)
      .map(([name, copies]) => ({ category: name, copies }))
      .sort((a, b) => b.copies - a.copies)

    const popular = Object.entries(
      scopedLoans.reduce<Record<string, number>>((acc, loan) => {
        acc[loan.bookId] = (acc[loan.bookId] ?? 0) + 1
        return acc
      }, {}),
    )
      .map(([bookId, count]) => ({
        book: data.books.find((item) => item.id === bookId),
        count,
      }))
      .filter((entry): entry is { book: NonNullable<(typeof data.books)[number]>; count: number } =>
        Boolean(entry.book),
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map((entry) => ({
        title: entry.book.title.length > 22 ? `${entry.book.title.slice(0, 21)}…` : entry.book.title,
        fullTitle: entry.book.title,
        count: entry.count,
      }))

    const activeLoans = data.loans.filter((loan) => loan.status === 'active' && inCategory(loan.bookId))
    const returnedLoans = data.loans.filter((loan) => loan.status === 'returned' && inCategory(loan.bookId))

    const inventory = data.books
      .filter((book) => book.status === 'active' && (category === 'all' || book.category === category))
      .reduce(
        (acc, book) => {
          const availability = getAvailability(book, data)
          acc.total += availability.total
          acc.onLoan += availability.onLoan
          acc.available += availability.available
          return acc
        },
        { total: 0, onLoan: 0, available: 0 },
      )

    return {
      buckets,
      circulation,
      membership,
      categories,
      popular,
      loansByStatus: [
        { name: 'Active', value: activeLoans.length },
        { name: 'Returned', value: returnedLoans.length },
        { name: 'Overdue', value: activeLoans.filter(isLoanOverdue).length },
      ],
      inventory,
      totalIssued: scopedLoans.length,
      totalReturned: returnedLoans.length,
      hasData: scopedLoans.length > 0,
      lateRate:
        returnedLoans.length > 0
          ? Math.round(
              (returnedLoans.filter((loan) => (loan.fineAmount ?? 0) > 0).length / returnedLoans.length) * 100,
            )
          : 0,
    }
  }, [data, months, category])
}
