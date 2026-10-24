import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  UserRound,
  Settings as SettingsIcon,
  Repeat2,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react'
import { NAV_ITEMS } from '@/lib/navigation'
import { ROLE_META } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { useLibrary } from '@/providers/LibraryProvider'
import { useToast } from '@/providers/ToastProvider'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { MenuItem, MenuLabel, MenuSeparator, Popover } from '@/components/ui/Menu'
import { Tooltip } from '@/components/ui/Menu'
import { PageTransition } from '@/components/animation/Reveal'
import { Logo, LogoMark } from './Logo'
import { GlobalSearch } from './GlobalSearch'
import { NotificationsPanel } from './NotificationsPanel'

const SIDEBAR_KEY = 'lumina.ui.sidebar.collapsed'

export function AppShell() {
  const { member, role, can, logout, mode } = useAuth()
  const { syncing, lastSyncedAt, dataError, refresh, clearDataError } = useLibrary()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const outlet = useOutlet()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1'
    } catch {
      return false
    }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
    } catch {
      /* non-critical */
    }
  }, [collapsed])

  useEffect(() => {
    setMobileOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [mobileOpen])

  if (!member || !role) return null

  const items = NAV_ITEMS.filter((item) => !item.permission || can(item.permission))
  const roleMeta = ROLE_META[role]

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
    toast.info(
      mode === 'live' ? 'Signed out' : 'Signed out of the demo',
      mode === 'live' ? 'Your session token was revoked on the server.' : 'Your library data stays saved on this device.',
    )
  }

  const handleRefresh = async () => {
    const result = await refresh()
    if (result.ok) toast.success('Library data refreshed', 'Latest records read from the library backend.')
    else toast.error('Refresh failed', result.error)
  }

  const navList = (compact: boolean, onNavigate?: () => void) => (
    <nav aria-label="Primary" className="flex flex-col gap-0.5 px-2.5">
      {items.map((item) => {
        const label = role === 'student' && item.studentLabel ? item.studentLabel : item.label
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 rounded-lg py-2 text-[13px] font-medium transition-colors duration-200',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
                compact ? 'justify-center px-0' : 'px-2.5',
                isActive ? 'text-fg' : 'text-fg-muted hover:bg-white/[0.045] hover:text-fg-soft',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId={reduced ? undefined : 'sidebar-active'}
                    className="absolute inset-0 rounded-lg border border-white/8 bg-white/[0.06]"
                    transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  />
                )}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 left-0 h-4.5 w-[2.5px] -translate-y-1/2 rounded-r-full bg-brand-400"
                  />
                )}
                {compact ? (
                  <Tooltip content={label} side="right">
                    <item.icon
                      className={cn('size-4.5 shrink-0 transition-colors', isActive ? 'text-brand-300' : '')}
                      aria-hidden="true"
                    />
                    <span className="sr-only">{label}</span>
                  </Tooltip>
                ) : (
                  <>
                    <item.icon
                      className={cn('size-4.5 shrink-0 transition-colors', isActive ? 'text-brand-300' : '')}
                      aria-hidden="true"
                    />
                    <span className="relative z-1 truncate">{label}</span>
                  </>
                )}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )

  const sidebarFooter = (
    <div className="mt-auto space-y-2 border-t border-white/6 p-2.5">
      {!collapsed && (
        <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            {mode === 'live' ? (
              <>
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    dataError ? 'bg-danger-400' : syncing ? 'bg-warning-400 animate-pulse' : 'bg-positive-400',
                  )}
                  aria-hidden="true"
                />
                <p className="text-[11px] font-semibold text-fg-soft">
                  {dataError ? 'Sync problem' : syncing ? 'Syncing…' : 'Google Sheets connected'}
                </p>
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 text-violet-400" aria-hidden="true" />
                <p className="text-[11px] font-semibold text-fg-soft">Demo workspace</p>
              </>
            )}
          </div>
          <p className="mt-0.5 text-[10.5px] leading-snug text-fg-faint">
            {mode === 'live'
              ? lastSyncedAt
                ? `Updated ${formatAgo(lastSyncedAt)} · refreshes on each change`
                : 'Reading the latest records…'
              : 'Sample data stored in this browser only.'}
          </p>
          {mode === 'live' && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={syncing}
              className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-white/8 px-1.5 py-1 text-[10.5px] text-fg-muted transition-colors hover:border-white/16 hover:text-fg disabled:opacity-50"
            >
              <RefreshCw className={cn('size-3', syncing && 'animate-spin')} aria-hidden="true" />
              Refresh now
            </button>
          )}
        </div>
      )}
      <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'justify-between gap-2')}>
        <div className={cn('flex min-w-0 items-center gap-2', collapsed && 'flex-col')}>
          <Avatar name={member.name} size="sm" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-fg">{member.name}</p>
              <p className="truncate text-[10.5px] text-fg-faint">{roleMeta.label}</p>
            </div>
          )}
        </div>
        {!collapsed && (
          <IconButton
            label="Collapse sidebar"
            size="icon"
            variant="ghost"
            onClick={() => setCollapsed(true)}
            className="size-7"
          >
            <PanelLeftClose className="size-4" aria-hidden="true" />
          </IconButton>
        )}
      </div>
      {collapsed && (
        <IconButton
          label="Expand sidebar"
          size="icon"
          variant="ghost"
          onClick={() => setCollapsed(false)}
          className="size-7"
        >
          <PanelLeftOpen className="size-4" aria-hidden="true" />
        </IconButton>
      )}
    </div>
  )

  const crumbs = buildCrumbs(location.pathname)

  return (
    <div className="min-h-svh bg-ink-950">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-200 focus:rounded-lg focus:bg-ink-750 focus:px-3 focus:py-2 focus:text-[13px] focus:text-fg focus:ring-2 focus:ring-brand-400"
      >
        Skip to main content
      </a>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-white/6 bg-ink-900/80 backdrop-blur-xl transition-[width] duration-300 ease-[var(--ease-out-soft)] lg:flex',
          collapsed ? 'w-[76px]' : 'w-[248px]',
        )}
        aria-label="Sidebar"
      >
        <div className={cn('flex h-15 items-center border-b border-white/6', collapsed ? 'justify-center px-2' : 'px-4')}>
          <Logo to="/app" compact={collapsed} />
        </div>
        <div className={cn('py-3', collapsed && 'px-0')}>{navList(collapsed)}</div>
        <div className="flex-1" />
        <div className={cn('px-2.5 pb-2', collapsed && 'px-2')}>
          <Link
            to="/catalog"
            className={cn(
              'flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] py-2 text-[12px] text-fg-soft transition-colors hover:border-white/16 hover:text-fg',
              collapsed ? 'justify-center px-0' : 'px-2.5',
            )}
          >
            <ChevronRight className="size-3.5" aria-hidden="true" />
            {!collapsed && <span className="truncate">Public catalogue</span>}
          </Link>
        </div>
        {sidebarFooter}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-90 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.2 }}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex h-full w-[82vw] max-w-[300px] flex-col border-r border-white/8 bg-ink-900"
            >
              <div className="flex h-15 items-center justify-between border-b border-white/6 px-4">
                <Logo to="/app" />
                <IconButton label="Close navigation" onClick={() => setMobileOpen(false)}>
                  <X className="size-4.5" aria-hidden="true" />
                </IconButton>
              </div>
              <div className="py-3">{navList(false, () => setMobileOpen(false))}</div>
              <div className="flex-1" />
              <div className="mt-auto border-t border-white/6 p-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={member.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-fg">{member.name}</p>
                    <p className="truncate text-[11px] text-fg-muted">{member.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-3 flex w-full items-center gap-2 rounded-lg border border-white/8 px-3 py-2 text-[12.5px] text-fg-soft transition-colors hover:border-danger-500/30 hover:text-danger-400"
                >
                  <LogOut className="size-3.5" aria-hidden="true" /> Sign out
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          'flex min-h-svh flex-col transition-[padding] duration-300 ease-[var(--ease-out-soft)]',
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]',
        )}
      >
        <header className="sticky top-0 z-40 border-b border-white/6 bg-ink-950/85 backdrop-blur-xl">
          <div className="flex h-15 items-center gap-2 px-3 sm:gap-3 sm:px-5">
            <IconButton
              label="Open navigation"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" aria-hidden="true" />
            </IconButton>

            <div className="hidden min-w-0 items-center gap-1.5 text-[12.5px] md:flex">
              {crumbs.map((crumb, index) => (
                <span key={crumb.label} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 && <ChevronLeft className="size-3 shrink-0 rotate-180 text-fg-faint" aria-hidden="true" />}
                  {crumb.to ? (
                    <Link to={crumb.to} className="truncate text-fg-muted transition-colors hover:text-fg-soft">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="truncate font-medium text-fg">{crumb.label}</span>
                  )}
                </span>
              ))}
            </div>

            <div className="ml-auto flex min-w-0 flex-1 justify-end md:flex-none">
              <div className="hidden w-full max-w-xs sm:block">
                <GlobalSearch />
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Badge tone="outline" className="hidden xl:inline-flex">
                {roleMeta.short}
              </Badge>
              <NotificationsPanel />
              <ProfileMenu onLogout={handleLogout} />
            </div>
          </div>
          {mode === 'live' && dataError && (
            <div className="border-t border-danger-500/20 bg-danger-500/[0.07] px-3 py-1.5 sm:px-5">
              <div className="flex items-center gap-2 text-[11.5px] text-danger-300">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                <p className="min-w-0 flex-1 truncate">{dataError}</p>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="shrink-0 rounded-md border border-danger-500/30 px-1.5 py-0.5 text-[10.5px] transition-colors hover:bg-danger-500/10"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={clearDataError}
                  aria-label="Dismiss sync error"
                  className="shrink-0 rounded-md p-0.5 transition-colors hover:bg-white/8"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
          <div className="border-t border-white/6 px-3 py-2 sm:hidden">
            <GlobalSearch />
          </div>
        </header>

        <main id="main-content" className="flex-1">
          <div className="container-app px-3 py-4 sm:px-5 sm:py-6">
            <AnimatePresence mode="wait" initial={false}>
              <PageTransition key={location.pathname}>{outlet}</PageTransition>
            </AnimatePresence>
          </div>
        </main>

        <footer className="border-t border-white/6 px-4 py-3">
          <p className="text-center text-[11px] text-fg-faint sm:text-left">
            {mode === 'live'
              ? 'Lumina Library · connected to Google Sheets via Apps Script · not a production identity provider'
              : 'Lumina Library · demo prototype · sample data only — not connected to a real institution'}
          </p>
        </footer>
      </div>
    </div>
  )
}

function ProfileMenu({ onLogout }: { onLogout: () => void }) {
  const { member, role, mode } = useAuth()
  const navigate = useNavigate()
  if (!member || !role) return null
  const roleMeta = ROLE_META[role]

  return (
    <Popover
      label="Account menu"
      trigger={({ toggle, open, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
        >
          <Avatar name={member.name} size="sm" />
          <ChevronRight className="hidden size-3.5 rotate-90 text-fg-faint sm:block" aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar name={member.name} size="md" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-fg">{member.name}</p>
              <p className="truncate text-[11px] text-fg-muted">{roleMeta.label} · {member.id}</p>
            </div>
          </div>
          <MenuSeparator />
          <MenuLabel>Account</MenuLabel>
          <MenuItem
            icon={<UserRound />}
            onClick={() => {
              navigate('/app/profile')
              close()
            }}
          >
            Profile & preferences
          </MenuItem>
          <MenuItem
            icon={<SettingsIcon />}
            onClick={() => {
              navigate('/app/settings')
              close()
            }}
          >
            Settings
          </MenuItem>
          {mode === 'demo' && (
            <MenuItem
              icon={<Repeat2 />}
              onClick={() => {
                navigate('/login')
                close()
              }}
            >
              Switch demo role
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={<LogOut />} destructive onClick={onLogout}>
            Sign out
          </MenuItem>
        </>
      )}
    </Popover>
  )
}

/** Honest, coarse "x ago" wording — the app never claims real-time sync. */
function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes === 1) return '1 min ago'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}

function buildCrumbs(pathname: string) {
  const crumbs: { label: string; to?: string }[] = [{ label: 'Workspace', to: '/app' }]
  const segments = pathname.replace('/app', '').split('/').filter(Boolean)
  if (segments.length === 0) {
    crumbs.push({ label: 'Dashboard' })
    return crumbs
  }
  const labels: Record<string, string> = {
    books: 'Books',
    members: 'Members',
    loans: 'Circulation',
    reservations: 'Reservations',
    reports: 'Reports',
    profile: 'Profile',
    settings: 'Settings',
  }
  const label = labels[segments[0]] ?? segments[0]
  crumbs.push({ label, to: segments.length > 1 ? `/app/${segments[0]}` : undefined })
  if (segments.length > 1) crumbs.push({ label: segments[1] })
  return crumbs
}

export { LogoMark }
