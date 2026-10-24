import {
  ArrowLeftRight,
  Bookmark,
  ChartNoAxesColumn,
  LayoutDashboard,
  LibraryBig,
  Settings,
  UserRound,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PermissionKey } from '@/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  permission?: PermissionKey
  /** Label override per role. */
  studentLabel?: string
  end?: boolean
  description?: string
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true, description: 'Library overview' },
  { to: '/app/books', label: 'Books', icon: LibraryBig, permission: 'books.view', description: 'Catalogue & inventory' },
  {
    to: '/app/members',
    label: 'Members',
    icon: Users,
    permission: 'members.viewAll',
    description: 'Students & staff',
  },
  {
    to: '/app/loans',
    label: 'Circulation',
    icon: ArrowLeftRight,
    studentLabel: 'My Loans',
    description: 'Issue, return, renew',
  },
  {
    to: '/app/reservations',
    label: 'Reservations',
    icon: Bookmark,
    description: 'Holds and queues',
  },
  {
    to: '/app/reports',
    label: 'Reports',
    icon: ChartNoAxesColumn,
    permission: 'reports.view',
    description: 'Analytics & exports',
  },
  { to: '/app/profile', label: 'Profile', icon: UserRound, description: 'Your account' },
  { to: '/app/settings', label: 'Settings', icon: Settings, description: 'Preferences & policy' },
]

export const ROUTE_LABELS: Record<string, string> = {
  '/app': 'Dashboard',
  '/app/books': 'Books',
  '/app/members': 'Members',
  '/app/loans': 'Circulation',
  '/app/reservations': 'Reservations',
  '/app/reports': 'Reports',
  '/app/profile': 'Profile',
  '/app/settings': 'Settings',
  '/catalog': 'Catalogue',
  '/login': 'Sign in',
}

export function titleForPath(pathname: string) {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname]
  if (pathname.startsWith('/books/')) return 'Book details'
  return 'Lumina Library'
}
