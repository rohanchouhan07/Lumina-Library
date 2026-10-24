import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Eye, EyeOff, Loader2, LockKeyhole, LogIn, Mail } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { InlineAlert } from '@/components/ui/Feedback'

const loginSchema = z.object({
  identifier: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(6, 'Passwords are at least 6 characters'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LiveLoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const { loginWithPassword, authError, clearAuthError } = useAuth()
  const toast = useToast()
  const reduced = useReducedMotion()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
    mode: 'onSubmit',
  })

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    clearAuthError()
    const result = await loginWithPassword({
      identifier: values.identifier.trim(),
      password: values.password,
    })
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    toast.success('Signed in', 'Your session is verified by Supabase Auth.')
    onSignedIn()
  })

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <h2 className="text-[17px] font-semibold tracking-tight text-fg">Sign in to Lumina Library</h2>
      <p className="mt-1 text-[12.5px] text-fg-muted">
        Sign in with the email and password created for your Supabase Auth account.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3.5" noValidate>
        <Field label="Email address" required error={errors.identifier?.message}>
          {(fieldProps) => (
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-faint" aria-hidden="true" />
              <Input
                {...fieldProps}
                {...register('identifier')}
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@institution.edu"
                className="pl-9.5"
                disabled={isSubmitting}
              />
            </div>
          )}
        </Field>

        <Field label="Password" required error={errors.password?.message}>
          {(fieldProps) => (
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-faint" aria-hidden="true" />
              <Input
                {...fieldProps}
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Your password"
                className="pr-10 pl-9.5"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-fg-faint transition-colors hover:bg-white/8 hover:text-fg"
              >
                {showPassword ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
              </button>
            </div>
          )}
        </Field>

        {(formError || authError) && (
          <InlineAlert tone="danger" title="Could not sign in">
            {formError ?? authError}
          </InlineAlert>
        )}

        <Button
          type="submit"
          size="lg"
          fullWidth
          disabled={isSubmitting}
          leftIcon={isSubmitting ? <Loader2 className="animate-spin" /> : <LogIn />}
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-3 text-[11px] leading-relaxed text-fg-faint">
        Accounts are created by a library administrator. Public sign-up is disabled. Supabase Auth manages password hashing and session tokens; this browser tab keeps a temporary session that clears when the tab closes.
      </p>
    </motion.div>
  )
}
