import { callApi } from './apiClient'
import type { ApiLoan } from '@/types/api'

export async function listLoans(status?: string): Promise<ApiLoan[]> {
  const result = await callApi<{ loans: ApiLoan[] }>('loans.list', status ? { status } : {})
  return result.loans
}

/** Issue a copy. Staff may target any member; other roles may only self-issue. */
export async function issueLoan(bookId: string, userId?: string): Promise<ApiLoan> {
  const result = await callApi<{ loan: ApiLoan }>('loans.issue', userId ? { bookId, userId } : { bookId })
  return result.loan
}

export async function returnLoan(loanId: string): Promise<{ loan: ApiLoan; fine: number; daysLate: number }> {
  return callApi<{ loan: ApiLoan; fine: number; daysLate: number }>('loans.return', { loanId })
}

export async function renewLoan(loanId: string): Promise<ApiLoan> {
  const result = await callApi<{ loan: ApiLoan }>('loans.renew', { loanId })
  return result.loan
}
