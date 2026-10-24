import { useEffect } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2, ShieldAlert } from 'lucide-react'
import type { PermissionKey } from '@/types'
import { useAuth } from '@/providers/AuthProvider'
import { AppShell } from '@/components/layout/AppShell'
import { PublicLayout } from '@/components/landing/PublicLayout'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Feedback'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { CatalogPage } from '@/pages/CatalogPage'
import { BookDetailsPage } from '@/pages/BookDetailsPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { BooksPage } from '@/pages/BooksPage'
import { MembersPage } from '@/pages/MembersPage'
import { LoansPage } from '@/pages/LoansPage'
import { ReservationsPage } from '@/pages/ReservationsPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { SettingsPage } from '@/pages/SettingsPage'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])
  return null
}

function SessionSplash() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-ink-950">
      <div className="flex items-center gap-2.5 text-[13px] text-fg-muted">
        <Loader2 className="size-4 animate-spin text-brand-300" aria-hidden="true" />
        Verifying your session…
      </div>
    </div>
  )
}

function RequireAuth() {
  const { isAuthenticated, justLoggedOut, booting } = useAuth()
  const location = useLocation()
  // A stored token is being validated against the backend — don't flash the login screen.
  if (booting) return <SessionSplash />
  if (!isAuthenticated) {
    // After an explicit sign-out, land on the public site rather than the login screen.
    return <Navigate to={justLoggedOut() ? '/' : '/login'} replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

function RequirePermission({ permission, children }: { permission: PermissionKey; children: React.ReactNode }) {
  const { can, role } = useAuth()
  if (!can(permission)) {
    return (
      <EmptyState
        icon={<ShieldAlert />}
        title="This area is restricted"
        description={`Your ${role ?? 'current'} role does not have access to this screen. Ask a library administrator if you need it.`}
        action={
          <div className="flex gap-2">
            <Link to="/app">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
            <Link to="/app/profile">
              <Button>Your profile</Button>
            </Link>
          </div>
        }
      />
    )
  }
  return <>{children}</>
}

/** Already signed in? Skip the login screen. */
function LoginRoute() {
  const { isAuthenticated, booting } = useAuth()
  if (booting) return <SessionSplash />
  if (isAuthenticated) return <Navigate to="/app" replace />
  return <LoginPage />
}

function NotFoundPage() {
  return (
    <div className="container-page flex min-h-svh items-center justify-center py-20">
      <EmptyState
        icon={<ShieldAlert />}
        title="Page not found"
        description="That route does not exist. Return to the landing page or open your dashboard."
        action={
          <div className="flex gap-2">
            <Link to="/">
              <Button variant="secondary">Home</Button>
            </Link>
            <Link to="/app">
              <Button>Dashboard</Button>
            </Link>
          </div>
        }
      />
    </div>
  )
}

export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/books/:id" element={<BookDetailsPage />} />
        </Route>

        <Route path="/login" element={<LoginRoute />} />

        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="books" element={<BooksPage />} />
            <Route
              path="members"
              element={
                <RequirePermission permission="members.viewAll">
                  <MembersPage />
                </RequirePermission>
              }
            />
            <Route path="loans" element={<LoansPage />} />
            <Route path="reservations" element={<ReservationsPage />} />
            <Route
              path="reports"
              element={
                <RequirePermission permission="reports.view">
                  <ReportsPage />
                </RequirePermission>
              }
            />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}
