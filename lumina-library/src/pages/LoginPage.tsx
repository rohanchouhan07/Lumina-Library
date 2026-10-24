import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Info,
  Loader2,
  LibraryBig,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react'
import type { Role } from '@/types'
import { ROLE_META } from '@/lib/permissions'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Logo } from '@/components/layout/Logo'
import { InlineAlert } from '@/components/ui/Feedback'
import { Combobox } from '@/components/ui/Combobox'
import { Avatar } from '@/components/ui/Avatar'
import { LiveLoginForm } from '@/components/auth/LiveLoginForm'

const ROLE_CARDS: {
  role: Role
  icon: typeof ShieldCheck
  perks: string[]
  accent: string
}[] = [
  {
    role: 'admin',
    icon: ShieldCheck,
    perks: ['Full inventory control', 'Members & policy settings', 'Analytics + reset demo data'],
    accent: 'from-brand-500/20 to-brand-500/0 border-brand-500/30 text-brand-300',
  },
  {
    role: 'librarian',
    icon: LibraryBig,
    perks: ['Issue, return & renew', 'Register members', 'Manage holds and fines'],
    accent: 'from-violet-500/20 to-violet-500/0 border-violet-500/30 text-violet-400',
  },
  {
    role: 'student',
    icon: GraduationCap,
    perks: ['Borrow and reserve titles', 'Track due dates & fines', 'Personal wishlist'],
    accent: 'from-cyan-500/20 to-cyan-500/0 border-cyan-500/30 text-cyan-400',
  },
]

export function LoginPage() {
  const { data, storageOk } = useLibrary()
  const { mode, loginWithDemoSeat, member: currentMember, logout, booting } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const [searchParams] = useSearchParams()
  const initialRole = (searchParams.get('role') as Role | null) ?? null
  const [role, setRole] = useState<Role>(initialRole && ROLE_META[initialRole] ? initialRole : 'admin')
  const [studentId, setStudentId] = useState('M-1004')
  const [error, setError] = useState<string | null>(null)

  const accountsByRole = useMemo(() => {
    const active = data.members.filter((member) => member.status === 'active')
    return {
      admin: active.find((member) => member.role === 'admin') ?? null,
      librarian: active.find((member) => member.role === 'librarian') ?? null,
      faculty: active.find((member) => member.role === 'faculty') ?? null,
      students: active.filter((member) => member.role === 'student'),
    }
  }, [data.members])

  useEffect(() => {
    if (accountsByRole.students.length > 0 && !accountsByRole.students.some((s) => s.id === studentId)) {
      setStudentId(accountsByRole.students[0].id)
    }
  }, [accountsByRole.students, studentId])

  const selectedMemberId =
    role === 'student' ? studentId : role === 'admin' ? (accountsByRole.admin?.id ?? '') : role === 'librarian' ? (accountsByRole.librarian?.id ?? '') : (accountsByRole.faculty?.id ?? '')

  const selectedAccount = data.members.find((item) => item.id === selectedMemberId)

  const handleEnter = () => {
    setError(null)
    if (!selectedMemberId) {
      setError(`No active ${ROLE_META[role].label.toLowerCase()} demo profile is available in the dataset.`)
      return
    }
    const result = loginWithDemoSeat(role, selectedMemberId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(`Signed in as ${ROLE_META[role].label}`, selectedAccount?.name)
    navigate('/app')
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-ink-950">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 size-[34rem] rounded-full bg-brand-600/16 blur-[120px]" />
        <div className="absolute -right-32 bottom-0 size-[30rem] rounded-full bg-violet-600/14 blur-[120px]" />
        <div className="absolute inset-0 grid-lines opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      <div className="relative mx-auto flex min-h-svh max-w-6xl flex-col px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <Logo />
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-fg-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to home
          </Link>
        </div>

        <div className="mt-8 grid flex-1 items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
          <div className="hidden lg:block">
            <Badge tone="brand">
              <Sparkles className="size-3" aria-hidden="true" />
              {mode === 'live' ? 'Connected to Google Sheets' : 'Offline demo access'}
            </Badge>
            <h1 className="mt-4 font-display text-[clamp(2.2rem,4vw,3.2rem)] leading-[1.03] font-semibold tracking-tight">
              {mode === 'live' ? (
                <>
                  One account. <span className="text-gradient-warm">The workspace your role allows.</span>
                </>
              ) : (
                <>
                  Choose how you want to <span className="text-gradient-warm">experience the library.</span>
                </>
              )}
            </h1>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-fg-muted">
              {mode === 'live'
                ? 'Credentials are verified by the library server, the role is read from your account, and every change is written back to the library spreadsheet.'
                : 'Each role opens a different workspace built on the same live dataset. Switch at any time — the demo keeps your changes in this browser.'}
            </p>

            <ul className="mt-6 space-y-2.5">
              {(mode === 'live'
                ? [
                    'Email or institutional ID, verified server-side',
                    'Role, availability and fines come from the sheet',
                    'Failed writes surface an error — never a false success',
                  ]
                : [
                    'No password or personal data required',
                    'Sample books, members and circulation records',
                    'Everything persists through page reloads',
                  ]
              ).map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12.5px] text-fg-soft">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-positive-400" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-7 rounded-xl border border-white/8 bg-white/[0.025] p-4">
              <div className="flex items-center gap-2">
                <Info className="size-3.5 text-brand-300" aria-hidden="true" />
                <p className="text-[11.5px] font-medium text-fg-soft">
                  {mode === 'live' ? 'Prototype-grade authentication' : 'This is not real authentication'}
                </p>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-fg-muted">
                {mode === 'live'
                  ? 'Passwords are salted and hashed with iterated HMAC-SHA256 inside Apps Script — real hashing, but not a production identity provider. Sessions are opaque tokens stored in the sheet.'
                  : 'Role selection only changes what the interface allows in this prototype. A production system would validate sessions on a server.'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-ink-900/70 p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-6">
            {currentMember && (
              <InlineAlert
                tone="info"
                className="mb-4"
                title={`You're signed in as ${currentMember.name}`}
                action={
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      logout()
                      toast.info('Signed out of the demo')
                    }}
                  >
                    Sign out
                  </Button>
                }
              >
                Continue to the dashboard or pick another role below.
              </InlineAlert>
            )}

            {mode === 'live' && booting ? (
              <div className="flex items-center gap-2.5 py-6 text-[12.5px] text-fg-muted">
                <Loader2 className="size-4 animate-spin text-brand-300" aria-hidden="true" />
                Restoring your session…
              </div>
            ) : mode === 'live' ? (
              <LiveLoginForm onSignedIn={() => navigate('/app')} />
            ) : (
              <>
            <h2 className="text-[17px] font-semibold tracking-tight text-fg">Sign in to the demo</h2>
            <p className="mt-1 text-[12.5px] text-fg-muted">
              Pick a role, then enter the workspace instantly.
            </p>

            <div className="mt-4 space-y-2" role="radiogroup" aria-label="Demo role">
              {ROLE_CARDS.map((card) => {
                const selected = role === card.role
                return (
                  <button
                    key={card.role}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setRole(card.role)
                      setError(null)
                    }}
                    className={cn(
                      'relative flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all duration-250',
                      selected
                        ? 'border-brand-500/40 bg-brand-500/[0.07] shadow-[0_0_0_1px_rgba(91,140,255,0.15)]'
                        : 'border-white/8 bg-white/[0.02] hover:border-white/16 hover:bg-white/[0.04]',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-lg border bg-gradient-to-b',
                        card.accent,
                      )}
                    >
                      <card.icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-fg">{ROLE_META[card.role].label}</span>
                        {selected && <Badge tone="brand">Selected</Badge>}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-fg-muted">
                        {ROLE_META[card.role].description}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {card.perks.map((perk) => (
                          <span
                            key={perk}
                            className="rounded-full border border-white/8 bg-white/[0.03] px-1.5 py-0.5 text-[9.5px] text-fg-faint"
                          >
                            {perk}
                          </span>
                        ))}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'mt-1 grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
                        selected ? 'border-brand-400 bg-brand-500' : 'border-white/20',
                      )}
                      aria-hidden="true"
                    >
                      {selected && <span className="size-1.5 rounded-full bg-white" />}
                    </span>
                  </button>
                )
              })}
            </div>

            <AnimatePresence mode="wait">
              {role === 'student' && (
                <motion.div
                  key="student-picker"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: reduced ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="student-profile" className="text-[12.5px] font-medium text-fg-soft">
                        Demo student profile
                      </label>
                      <span className="text-[11px] text-fg-faint">
                        {accountsByRole.students.length} available
                      </span>
                    </div>
                    <Combobox
                      id="student-profile"
                      options={accountsByRole.students.map((student) => ({
                        value: student.id,
                        label: student.name,
                        description: `${student.id} · ${student.department}`,
                        meta: `${data.loans.filter((loan) => loan.memberId === student.id && loan.status === 'active').length} on loan`,
                      }))}
                      value={studentId}
                      onChange={setStudentId}
                      searchPlaceholder="Search students…"
                      placeholder="Select a student"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {selectedAccount && (
              <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
                <Avatar name={selectedAccount.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-fg">{selectedAccount.name}</p>
                  <p className="truncate text-[11px] text-fg-muted">
                    {selectedAccount.email} · {selectedAccount.department}
                  </p>
                </div>
                <Badge tone="outline">{selectedAccount.id}</Badge>
              </div>
            )}

            {error && (
              <InlineAlert tone="danger" className="mt-3">
                {error}
              </InlineAlert>
            )}

            {!storageOk && (
              <InlineAlert tone="info" className="mt-3" title="Preview mode">
                Browser storage is blocked in this embedded preview, so changes are kept in memory for this session.
                Run the project locally for persistence across reloads.
              </InlineAlert>
            )}

            <Button className="mt-4" size="lg" fullWidth onClick={handleEnter} rightIcon={<ArrowRight />}>
              Enter {ROLE_META[role].label} demo
            </Button>

            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-fg-faint">
              <span className="inline-flex items-center gap-1">
                <UserRound className="size-3" aria-hidden="true" />
                Demo profile only
              </span>
              <Link to="/catalog" className="inline-flex items-center gap-1 transition-colors hover:text-fg-soft">
                Browse without signing in
                <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-lg border border-white/6 bg-ink-950/40 px-3 py-2">
              <Users className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
              <p className="text-[10.5px] leading-relaxed text-fg-faint">
                Tip: sign in as an administrator to review policy and reset the demo dataset at any time.
              </p>
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
