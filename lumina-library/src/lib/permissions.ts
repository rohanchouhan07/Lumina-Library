import type { PermissionKey, Role } from '@/types'

/**
 * Central authorisation matrix. Every role check in the UI funnels through `can()`
 * so a permission change only needs to happen in one place.
 *
 * This is a frontend demo — permissions shape the UI, they are not a security boundary.
 */
export const ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  admin: [
    'books.view',
    'books.create',
    'books.update',
    'books.archive',
    'books.delete',
    'members.viewAll',
    'members.create',
    'members.update',
    'members.toggleStatus',
    'loans.viewAll',
    'loans.issue',
    'loans.return',
    'loans.renewAny',
    'reservations.viewAll',
    'reservations.create',
    'reservations.cancelAny',
    'reports.view',
    'reports.export',
    'settings.manage',
    'data.reset',
    'activity.view',
    'users.manage',
    'system.view',
  ],
  librarian: [
    'books.view',
    'books.create',
    'books.update',
    'books.archive',
    'members.viewAll',
    'members.create',
    'members.update',
    'members.toggleStatus',
    'loans.viewAll',
    'loans.issue',
    'loans.return',
    'loans.renewAny',
    'reservations.viewAll',
    'reservations.create',
    'reservations.cancelAny',
    'reports.view',
    'reports.export',
    'activity.view',
  ],
  faculty: [
    'books.view',
    'loans.selfServe',
    'reservations.create',
    'reports.export',
  ],
  student: ['books.view', 'loans.selfServe', 'reservations.create', 'reports.export'],
}

export function can(role: Role | null | undefined, permission: PermissionKey): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role].includes(permission)
}

export const ROLE_META: Record<
  Role,
  { label: string; short: string; description: string; accent: string; home: string }
> = {
  admin: {
    label: 'Administrator',
    short: 'Admin',
    description: 'Full oversight of the catalogue, members, circulation policy and analytics.',
    accent: 'brand',
    home: '/app',
  },
  librarian: {
    label: 'Librarian',
    short: 'Librarian',
    description: 'Day-to-day circulation: issue, return, renew, register members and manage holds.',
    accent: 'violet',
    home: '/app',
  },
  faculty: {
    label: 'Faculty',
    short: 'Faculty',
    description: 'Browse the catalogue, borrow and reserve titles, and track your own circulation.',
    accent: 'cyan',
    home: '/app',
  },
  student: {
    label: 'Student',
    short: 'Student',
    description: 'Browse the catalogue, borrow and reserve titles, track due dates and fines.',
    accent: 'cyan',
    home: '/app',
  },
}
