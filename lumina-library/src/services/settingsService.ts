import { callApi } from './apiClient'
import type { ApiSettings } from '@/types/api'

export async function getSettings(): Promise<{ settings: ApiSettings; editable: boolean }> {
  return callApi<{ settings: ApiSettings; editable: boolean }>('settings.get')
}

export async function updateSettings(settings: ApiSettings): Promise<ApiSettings> {
  const result = await callApi<{ settings: ApiSettings }>('settings.update', { settings })
  return result.settings
}
