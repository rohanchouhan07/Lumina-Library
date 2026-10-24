import { callApi } from './apiClient'
import type { ApiActivity, ApiAnalytics, ApiDashboardStats } from '@/types/api'

export async function getDashboard(): Promise<ApiDashboardStats> {
  return callApi<ApiDashboardStats>('reports.dashboard')
}

export async function getAnalytics(from: string, to: string): Promise<ApiAnalytics> {
  return callApi<ApiAnalytics>('reports.analytics', { from, to })
}

export async function listActivity(limit = 40): Promise<ApiActivity[]> {
  const result = await callApi<{ activity: ApiActivity[] }>('activity.list', { limit })
  return result.activity
}
