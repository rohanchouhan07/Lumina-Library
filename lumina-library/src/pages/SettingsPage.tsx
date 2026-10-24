import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Database,
  Download,
  HardDrive,
  Info,
  Lock,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import type { LibraryConfig } from '@/types'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { configSchema, type ConfigFormValues } from '@/lib/validation'
import { exportBooksCsv, exportLoansCsv, exportMembersCsv, exportReservationsCsv } from '@/lib/exportUtils'
import { formatDate } from '@/lib/dateUtils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IS_API_CONFIGURED } from '@/config/env'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { Switch } from '@/components/ui/Switch'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { InlineAlert } from '@/components/ui/Feedback'
import { PreferencesPanel } from '@/components/settings/PreferencesPanel'
import { ConnectionPanel } from '@/components/settings/ConnectionPanel'
import { ROLE_META } from '@/lib/permissions'

export function SettingsPage() {
  const { data, storageOk, recovered, resetDemoData, refreshFromStorage } = useLibrary()
  const { can, role, mode } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [resetOpen, setResetOpen] = useState(false)

  const handleReset = async () => {
    const result = await resetDemoData()
    if (!result.ok) {
      toast.error('Reset failed', result.error)
    } else {
      toast.success('Demo data restored', 'The original sample dataset was loaded again.')
    }
    setResetOpen(false)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description={mode === 'live' ? 'Interface preferences, circulation policy and the Supabase connection.' : 'Interface preferences, circulation policy and local demo data management.'}
        actions={
          mode === 'live' ? (
            <Badge tone="success">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Server-issued session
            </Badge>
          ) : (
            <Badge tone={storageOk ? 'success' : 'warn'}>
              <HardDrive className="size-3" aria-hidden="true" />
              {storageOk ? 'Local storage active' : 'Session-only storage'}
            </Badge>
          )
        }
      />

      {!storageOk && (
        <InlineAlert tone="info" title="Session-only storage">
          This browser (or embedded preview) is blocking <code>localStorage</code>. The demo stays fully interactive —
          changes are held in memory and reset when the page reloads.
        </InlineAlert>
      )}

      {recovered && (
        <InlineAlert tone="warn" title="Stored data was repaired">
          Saved data could not be read, so the demo was restored to its seeded dataset. A backup of the unreadable
          payload was kept in local storage for debugging.
        </InlineAlert>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <PreferencesPanel />

          {can('settings.manage') ? (
            <PolicyForm config={data.config} />
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lock className="size-4 text-fg-muted" aria-hidden="true" />
                  <CardTitle>Circulation policy</CardTitle>
                </div>
                <Badge tone="outline">Admins only</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-[12.5px] leading-relaxed text-fg-muted">
                  Loan duration, renewal limits, borrowing caps and fine rules are managed by library administrators.
                  Your {role ? ROLE_META[role].label.toLowerCase() : 'current'} role can view their effects throughout
                  the app but cannot change them.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px] sm:grid-cols-4">
                  <PolicyStat label="Loan period" value={`${data.config.loanDurationDays} days`} />
                  <PolicyStat label="Renewals" value={`${data.config.maxRenewals}`} />
                  <PolicyStat label="Fine rate" value={`₹${data.config.finePerDay}/day`} />
                  <PolicyStat label="Student limit" value={`${data.config.studentBorrowLimit} books`} />
                </div>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate('/login')}>
                  {IS_API_CONFIGURED ? 'Sign in as an administrator' : 'Switch to an admin demo'}
                </Button>
              </CardContent>
            </Card>
          )}

          <ConnectionPanel />

          <Card>
            <CardHeader>
              <div>
                <CardTitle>{mode === 'live' ? 'Library records' : 'Demo data'}</CardTitle>
                <p className="mt-0.5 text-[11.5px] text-fg-muted">
                  {mode === 'live' ? 'Read from Supabase on each refresh' : 'Stored in this browser only'}
                </p>
              </div>
              <Database className="size-4 text-fg-faint" aria-hidden="true" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <PolicyStat label="Books" value={String(data.books.length)} />
                <PolicyStat label="Members" value={String(data.members.length)} />
                <PolicyStat label="Loans" value={String(data.loans.length)} />
                <PolicyStat label="Reservations" value={String(data.reservations.length)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Download />}
                  onClick={() => {
                    exportBooksCsv(data.books, data)
                    exportMembersCsv(data.members, data)
                    exportLoansCsv(data.loans, data)
                    exportReservationsCsv(data)
                    toast.success('Exports generated', 'Four CSV files downloaded.')
                  }}
                >
                  Export all CSV
                </Button>
                {mode === 'demo' && (
                  <Button variant="ghost" size="sm" leftIcon={<RotateCcw />} onClick={refreshFromStorage}>
                    Reload from storage
                  </Button>
                )}
                {mode === 'demo' && can('data.reset') && (
                  <Button variant="danger" size="sm" leftIcon={<TriangleAlert />} onClick={() => setResetOpen(true)}>
                    Reset demo data
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-fg-faint">
                {mode === 'live'
                  ? 'Exports read your current session data. Changes are stored in Supabase; this build deliberately offers no destructive reset.'
                  : 'Resetting restores the seeded catalogue, members, loans and reservations. Your demo session stays signed in if the profile still exists.'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>About this workspace</CardTitle>
              <Badge tone={mode === 'live' ? 'success' : 'brand'}>{mode === 'live' ? 'Connected' : 'Demo'}</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-[12px] leading-relaxed text-fg-muted">
              <p>
                {mode === 'live'
                  ? 'Lumina Library uses Supabase Auth and PostgreSQL. Signed-in sessions are managed by Supabase Auth; role-scoped library records are stored in PostgreSQL and returned through the protected RPC.'
                  : 'Lumina Library is a front-end prototype. All data is fictional sample content created for demonstration and stored in your browser’s local storage.'}
              </p>
              <div className="space-y-2 rounded-lg border border-white/8 bg-ink-950/40 p-3">
                <InfoRow label="Library name" value={data.config.libraryName} />
                <InfoRow label="Dataset version" value={`v${data.version}`} />
                <InfoRow label="Last seeded" value={formatDate(new Date().toISOString())} />
                <InfoRow label="Storage key" value={mode === 'live' ? 'Supabase session (sessionStorage; tab-scoped)' : 'lumina.library.data.v1'} mono />
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-brand-500/20 bg-brand-500/[0.06] p-2.5">
                <Info className="mt-0.5 size-3.5 shrink-0 text-brand-300" aria-hidden="true" />
                <p className="text-[11.5px] text-fg-soft">
                  Fines are simulated at ₹{data.config.finePerDay} per overdue day. They are not real charges and this
                  app is not connected to any institution.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session</CardTitle>
              <Settings2 className="size-4 text-fg-faint" aria-hidden="true" />
            </CardHeader>
            <CardContent className="space-y-2 text-[12px] text-fg-muted">
              <p>
                You are signed in as <strong className="text-fg-soft">{role ? ROLE_META[role].label : 'guest'}</strong>.{' '}
                {mode === 'live'
                  ? 'Your role was issued by the backend when you signed in; the interface only mirrors it.'
                  : 'Role selection is a demo convenience and is not real authentication.'}
              </p>
              {mode === 'demo' && (
                <Button variant="secondary" size="sm" fullWidth onClick={() => navigate('/login')}>
                  Switch demo role
                </Button>
              )}
              <Button variant="ghost" size="sm" fullWidth leftIcon={<ShieldCheck />} onClick={() => navigate('/app/profile')}>
                View profile
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset all demo data?"
        description="Every book, member, loan, reservation and preference you created or changed will be replaced with the original seeded dataset. This cannot be undone."
        confirmLabel="Reset demo data"
        destructive
        onConfirm={handleReset}
      />
    </div>
  )
}

function PolicyForm({ config }: { config: LibraryConfig }) {
  const { updateConfig } = useLibrary()
  const toast = useToast()
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: config,
  })

  const submit = handleSubmit(async (values) => {
    const result = await updateConfig(values as LibraryConfig)
    if (!result.ok) {
      toast.error('Policy not saved', result.error)
      return
    }
    toast.success('Circulation policy updated', 'New rules apply to the next issue, return or renewal.')
    reset(values)
  })

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Circulation policy</CardTitle>
          <p className="mt-0.5 text-[11.5px] text-fg-muted">Administrator-only configuration</p>
        </div>
        <Badge tone="brand">Admin</Badge>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Library name" required error={errors.libraryName?.message}>
            {(fieldProps) => (
              <Input {...fieldProps} {...register('libraryName')} invalid={Boolean(errors.libraryName)} />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Loan duration (days)"
              required
              error={errors.loanDurationDays?.message}
              hint="Applied to new loans"
            >
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  {...register('loanDurationDays')}
                  type="number"
                  min={1}
                  max={90}
                  invalid={Boolean(errors.loanDurationDays)}
                />
              )}
            </Field>
            <Field label="Maximum renewals" required error={errors.maxRenewals?.message}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  {...register('maxRenewals')}
                  type="number"
                  min={0}
                  max={5}
                  invalid={Boolean(errors.maxRenewals)}
                />
              )}
            </Field>
            <Field label="Renewal extension (days)" required error={errors.renewalExtensionDays?.message}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  {...register('renewalExtensionDays')}
                  type="number"
                  min={1}
                  max={60}
                  invalid={Boolean(errors.renewalExtensionDays)}
                />
              )}
            </Field>
            <Field label="Fine per overdue day (₹)" required error={errors.finePerDay?.message} hint="Simulated">
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  {...register('finePerDay')}
                  type="number"
                  min={0}
                  step="1"
                  invalid={Boolean(errors.finePerDay)}
                />
              )}
            </Field>
            <Field label="Student borrowing limit" required error={errors.studentBorrowLimit?.message}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  {...register('studentBorrowLimit')}
                  type="number"
                  min={1}
                  max={20}
                  invalid={Boolean(errors.studentBorrowLimit)}
                />
              )}
            </Field>
            <Field label="Staff borrowing limit" required error={errors.staffBorrowLimit?.message}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  {...register('staffBorrowLimit')}
                  type="number"
                  min={1}
                  max={30}
                  invalid={Boolean(errors.staffBorrowLimit)}
                />
              )}
            </Field>
            <Field label="Reservation hold window (days)" required error={errors.reservationHoldDays?.message}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  {...register('reservationHoldDays')}
                  type="number"
                  min={1}
                  max={30}
                  invalid={Boolean(errors.reservationHoldDays)}
                />
              )}
            </Field>
            <Field
              label="Fine block threshold (₹)"
              required
              error={errors.fineBlockThreshold?.message}
              hint="Used when blocking is enabled"
            >
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  {...register('fineBlockThreshold')}
                  type="number"
                  min={0}
                  invalid={Boolean(errors.fineBlockThreshold)}
                />
              )}
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border border-white/8 bg-ink-950/40 p-3">
            <Switch
              id="self-checkout"
              label="Allow student self-checkout"
              description="Students can borrow available copies directly. When off, they request a copy and collect at the desk."
              checked={watch('allowStudentSelfCheckout')}
              onChange={(checked) => setValue('allowStudentSelfCheckout', checked, { shouldDirty: true })}
            />
            <Switch
              id="block-fines"
              label="Block issue when fines exceed threshold"
              description="Stops new loans for members whose simulated fines pass the threshold above."
              checked={watch('blockIssueOnUnpaidFines')}
              onChange={(checked) => setValue('blockIssueOnUnpaidFines', checked, { shouldDirty: true })}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-fg-faint">
              Changes are saved to Supabase PostgreSQL and apply after the next refresh.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => reset(config)} disabled={!isDirty}>
                Reset form
              </Button>
              <Button type="button" size="sm" leftIcon={<Save />} onClick={submit} loading={isSubmitting} disabled={!isDirty}>
                Save policy
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function PolicyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-2">
      <p className="text-[10px] tracking-[0.06em] text-fg-faint uppercase">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-fg">{value}</p>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px]">
      <span className="text-fg-muted">{label}</span>
      <span className={`truncate font-medium text-fg-soft ${mono ? 'font-mono text-[10.5px]' : ''}`}>{value}</span>
    </div>
  )
}
