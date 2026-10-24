import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { IS_API_CONFIGURED } from '@/config/env'
import { useToast } from '@/providers/ToastProvider'
import { changePassword } from '@/services/authService'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Field'
import { InlineAlert } from '@/components/ui/Feedback'

/**
 * Change the signed-in account's password.
 *
 * Live mode only: in the offline demo there is no server and therefore no password to
 * change, so the panel says so rather than pretending.
 *
 * The server re-hashes at the current work factor, and revokes every *other* live session
 * for the account — this tab keeps working, any other browser is signed out.
 */
const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string().min(1, 'Repeat the new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The two passwords do not match',
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  })

type Values = z.infer<typeof schema>

export function PasswordPanel() {
  const toast = useToast()
  const [show, setShow] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onSubmit',
  })

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    setDone(null)
    try {
      const result = await changePassword(values.currentPassword, values.newPassword)
      reset()
      setDone(result.sessionsRevoked ?? 0)
      toast.success(
        'Password changed',
        result.sessionsRevoked
          ? `Signed out ${result.sessionsRevoked} other session${result.sessionsRevoked === 1 ? '' : 's'}.`
          : 'Use the new password next time you sign in.',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The password could not be changed.'
      setFormError(message)
      toast.error('Password not changed', message)
    }
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-fg-muted" aria-hidden="true" />
          <CardTitle>Password</CardTitle>
        </div>
        {IS_API_CONFIGURED && <span className="text-[11px] text-fg-faint">Live account</span>}
      </CardHeader>
      <CardContent>
        {!IS_API_CONFIGURED ? (
          <InlineAlert tone="info" title="No server in demo mode">
            The offline demo has no accounts, so there is no password to change. Connect the
            Apps Script backend to manage real credentials.
          </InlineAlert>
        ) : (
          <form onSubmit={submit} className="space-y-3" noValidate>
            <p className="text-[12px] leading-relaxed text-fg-muted">
              Changing your password signs out every other device. It is re-hashed with a new salt on the
              server — nothing is stored in this browser.
            </p>

            <Field label="Current password" required error={errors.currentPassword?.message}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  {...register('currentPassword')}
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={isSubmitting}
                />
              )}
            </Field>

            <Field
              label="New password"
              required
              error={errors.newPassword?.message}
              hint="At least 8 characters, with a letter and a number"
            >
              {(fieldProps) => (
                <div className="relative">
                  <Input
                    {...fieldProps}
                    {...register('newPassword')}
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="pr-10"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((value) => !value)}
                    aria-label={show ? 'Hide passwords' : 'Show passwords'}
                    aria-pressed={show}
                    className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-fg-faint transition-colors hover:bg-white/8 hover:text-fg"
                  >
                    {show ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
                  </button>
                </div>
              )}
            </Field>

            <Field label="Confirm new password" required error={errors.confirmPassword?.message}>
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  {...register('confirmPassword')}
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                />
              )}
            </Field>

            {formError && (
              <InlineAlert tone="danger" title="Password not changed">
                {formError}
              </InlineAlert>
            )}

            {done !== null && (
              <InlineAlert tone="success" title="Password updated">
                {done > 0
                  ? `Saved, and ${done} other session${done === 1 ? '' : 's'} signed out.`
                  : 'Saved. Use the new password next time you sign in.'}
              </InlineAlert>
            )}

            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={isSubmitting}
              leftIcon={isSubmitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            >
              {isSubmitting ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
