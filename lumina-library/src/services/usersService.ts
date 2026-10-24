import { callApi } from './apiClient'
import type { ApiRole, ApiUser, ApiUserSummary } from '@/types/api'

export interface UserPayload {
  name: string
  email: string
  institutionalId: string
  role: ApiRole
  department: string
  phone?: string
  borrowingLimit?: number | string | null
  accountStatus?: 'ACTIVE' | 'INACTIVE'
  password?: string
}

export async function listUsers(role?: ApiRole): Promise<ApiUserSummary[]> {
  const result = await callApi<{ users: ApiUserSummary[] }>('users.list', role ? { role } : {})
  return result.users
}

export async function createUser(payload: UserPayload): Promise<ApiUser> {
  const result = await callApi<{ user: ApiUser }>('users.create', { ...payload })
  return result.user
}

export async function updateUser(userId: string, payload: UserPayload): Promise<ApiUser> {
  const result = await callApi<{ user: ApiUser }>('users.update', { userId, ...payload })
  return result.user
}

export async function setUserStatus(userId: string, accountStatus: 'ACTIVE' | 'INACTIVE'): Promise<ApiUser> {
  const result = await callApi<{ user: ApiUser }>('users.setStatus', { userId, accountStatus })
  return result.user
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<{ reset: boolean }> {
  return callApi<{ reset: boolean }>('users.resetPassword', { userId, newPassword })
}

export async function updateOwnProfile(input: {
  name: string
  phone?: string
  department?: string
}): Promise<ApiUser> {
  const result = await callApi<{ user: ApiUser }>('users.updateProfile', { ...input })
  return result.user
}
