import { useAuth } from '@/providers/AuthProvider'
import { AdminDashboard } from '@/components/dashboard/AdminDashboard'
import { LibrarianDashboard } from '@/components/dashboard/LibrarianDashboard'
import { StudentDashboard } from '@/components/dashboard/StudentDashboard'

export function DashboardPage() {
  const { role } = useAuth()
  if (role === 'admin') return <AdminDashboard />
  if (role === 'librarian') return <LibrarianDashboard />
  return <StudentDashboard />
}
