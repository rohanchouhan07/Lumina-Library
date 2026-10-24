import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Member } from '@/types'
import { memberSchema, type MemberFormValues } from '@/lib/validation'
import { DEPARTMENTS } from '@/data/seedData'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { InlineAlert } from '@/components/ui/Feedback'

const emptyValues: MemberFormValues = {
  name: '',
  email: '',
  institutionalId: '',
  department: DEPARTMENTS[0],
  role: 'student',
  status: 'active',
  phone: '',
  borrowingLimit: '',
  notes: '',
}

export function MemberFormDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member?: Member | null
}) {
  const { addMember, updateMember, data } = useLibrary()
  const { mode, can } = useAuth()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const isEdit = Boolean(member)
  // Only an existing account's password can be reset; new accounts need one in live mode.
  const needsPassword = mode === 'live' && !isEdit
  const canResetPassword = mode === 'live' && isEdit && can('users.manage')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return
    setFormError(null)
    setPassword('')
    setShowPassword(false)
    reset(
      member
        ? {
            name: member.name,
            email: member.email,
            institutionalId: member.institutionalId ?? '',
            department: member.department,
            role: member.role,
            status: member.status,
            phone: member.phone ?? '',
            borrowingLimit: member.borrowingLimit ? String(member.borrowingLimit) : '',
            notes: member.notes ?? '',
          }
        : emptyValues,
    )
  }, [open, member, reset])

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    if (mode === 'live' && !values.institutionalId?.trim()) {
      setFormError('An institutional ID is required — it is what the member uses to sign in alongside their email.')
      return
    }
    const payload = {
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      institutionalId: values.institutionalId?.trim() || undefined,
      department: values.department,
      role: values.role,
      status: values.status,
      phone: values.phone.trim() || undefined,
      borrowingLimit: values.borrowingLimit ? Number(values.borrowingLimit) : undefined,
      notes: values.notes.trim() || undefined,
      ...(password ? { password } : {}),
    }
    if (mode === 'live' && !isEdit && password.length < 8) {
      setFormError('Choose an initial password of at least 8 characters. The member can ask an admin to reset it later.')
      return
    }
    const result = isEdit && member ? await updateMember(member.id, payload) : await addMember(payload)
    if (!result.ok) {
      setFormError(result.error)
      toast.error(isEdit ? 'Member not updated' : 'Member not added', result.error)
      return
    }
    toast.success(
      isEdit ? 'Member updated' : 'Member registered',
      `${result.value.name} · ${result.value.id}`,
    )
    onOpenChange(false)
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit member' : 'Register a member'}
      description={
        isEdit
          ? 'Membership changes apply immediately to circulation eligibility.'
          : mode === 'live'
            ? 'Creates a real account in the library sheet. The member signs in with this email and the initial password you set.'
            : 'Members can borrow as soon as they are active. No real personal data is required for this demo.'
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Register member'}
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name?.message}>
            {(fieldProps) => (
              <Input {...fieldProps} {...register('name')} invalid={Boolean(errors.name)} placeholder="Riya Sharma" />
            )}
          </Field>
          <Field label="Email" required error={errors.email?.message}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                {...register('email')}
                type="email"
                invalid={Boolean(errors.email)}
                placeholder="riya.sharma@lumina.edu"
              />
            )}
          </Field>
          <Field
            label="Institutional ID"
            required={mode === 'live'}
            error={errors.institutionalId?.message}
            hint={mode === 'live' ? 'Roll number or staff ID — also accepted at sign-in' : 'Optional offline'}
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                {...register('institutionalId')}
                invalid={Boolean(errors.institutionalId)}
                placeholder="M-1004"
                autoCapitalize="characters"
              />
            )}
          </Field>
          <Field label="Department" required error={errors.department?.message}>
            {(fieldProps) => (
              <Select {...fieldProps} {...register('department')} invalid={Boolean(errors.department)}>
                {[...new Set([...DEPARTMENTS, ...data.members.map((m) => m.department)])].sort().map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Role" required error={errors.role?.message}>
            {(fieldProps) => (
              <Select {...fieldProps} {...register('role')} invalid={Boolean(errors.role)}>
                <option value="student">Student</option>
                <option value="faculty">Faculty</option>
                <option value="librarian">Librarian (desk staff)</option>
                <option value="admin">Administrator</option>
              </Select>
            )}
          </Field>
          <Field label="Membership status" required error={errors.status?.message}>
            {(fieldProps) => (
              <Select {...fieldProps} {...register('status')} invalid={Boolean(errors.status)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            )}
          </Field>
          <Field label="Phone" error={errors.phone?.message} hint="Optional">
            {(fieldProps) => (
              <Input {...fieldProps} {...register('phone')} invalid={Boolean(errors.phone)} placeholder="+91 98765 43210" />
            )}
          </Field>
          <Field
            label="Borrowing limit override"
            error={errors.borrowingLimit?.message}
            hint="Optional — leave blank for role default"
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                {...register('borrowingLimit')}
                type="number"
                min={1}
                max={20}
                invalid={Boolean(errors.borrowingLimit)}
                placeholder="4"
              />
            )}
          </Field>
          {(needsPassword || canResetPassword) && (
            <Field
              label={needsPassword ? 'Initial password' : 'Reset password'}
              required={needsPassword}
              hint={needsPassword ? 'At least 8 characters — stored as a salted hash' : 'Leave blank to keep the current password'}
              className="sm:col-span-2"
            >
              {(fieldProps) => (
                <div className="relative">
                  <Input
                    {...fieldProps}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={needsPassword ? 'Share this with the member securely' : 'New password (optional)'}
                    className="pr-16"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-1.5 py-1 text-[10.5px] text-fg-faint transition-colors hover:bg-white/8 hover:text-fg"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              )}
            </Field>
          )}

          <Field label="Notes" error={errors.notes?.message} className="sm:col-span-2">
            {(fieldProps) => (
              <Textarea {...fieldProps} {...register('notes')} rows={3} invalid={Boolean(errors.notes)} />
            )}
          </Field>
        </div>
      </form>
    </Dialog>
  )
}
