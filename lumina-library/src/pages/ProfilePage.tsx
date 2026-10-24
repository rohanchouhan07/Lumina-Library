import { IS_API_CONFIGURED } from '@/config/env'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  BadgeCheck,
  BookHeart,
  BookMarked,
  CalendarDays,
  CircleDollarSign,
  Heart,
  Mail,
  Pencil,
  Phone,
  Settings2,
} from 'lucide-react'
import type { Book } from '@/types'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { profileSchema, type ProfileFormValues } from '@/lib/validation'
import { DEPARTMENTS } from '@/data/seedData'
import { memberLoanHistory, memberOutstandingFines } from '@/features/library/engine'
import { formatDate, relativeTime } from '@/lib/dateUtils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge, StatusPill } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { InlineAlert, EmptyState } from '@/components/ui/Feedback'
import { Avatar } from '@/components/ui/Avatar'
import { BookCard } from '@/components/books/BookCard'
import { BookDetailDialog } from '@/components/books/BookDetailDialog'
import { ActivityFeed } from '@/components/circulation/ActivityFeed'
import { PreferencesPanel } from '@/components/settings/PreferencesPanel'
import { PasswordPanel } from '@/components/profile/PasswordPanel'
import { ROLE_META } from '@/lib/permissions'

export function ProfilePage() {
  const { data, updateProfile } = useLibrary()
  const { member, role } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)

  const wishlist = useMemo(
    () =>
      (member ? data.wishlists[member.id] ?? [] : [])
        .map((id) => data.books.find((book) => book.id === id))
        .filter((book): book is Book => Boolean(book)),
    [data.books, data.wishlists, member],
  )

  const loans = member ? memberLoanHistory(data, member.id) : []
  const active = loans.filter((loan) => loan.status === 'active')
  const returned = loans.filter((loan) => loan.status === 'returned')
  const fines = member ? memberOutstandingFines(data, member.id) : 0
  const activity = member
    ? data.activity.filter((entry) => entry.memberId === member.id || entry.message.includes(member.name))
    : []

  if (!member || !role) return null
  const roleMeta = ROLE_META[role]

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Account"
        title="Profile & preferences"
        description={
          IS_API_CONFIGURED
            ? 'Your account, reading activity and interface preferences.'
            : 'Your demo profile, reading activity and interface preferences.'
        }
        actions={
          <>
            <Button variant="secondary" size="sm" leftIcon={<Settings2 />} onClick={() => navigate('/app/settings')}>
              App settings
            </Button>
            <Button size="sm" leftIcon={<Pencil />} onClick={() => setEditOpen(true)}>
              Edit profile
            </Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card glow>
            <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-start">
              <Avatar name={member.name} size="xl" className="shadow-lift" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-fg">{member.name}</h2>
                  <Badge tone={role === 'admin' ? 'brand' : role === 'librarian' ? 'violet' : 'cyan'}>
                    {roleMeta.label}
                  </Badge>
                  <StatusPill
                    tone={member.status === 'active' ? 'success' : 'neutral'}
                    label={member.status === 'active' ? 'Active member' : 'Inactive'}
                  />
                </div>
                <p className="mt-1 text-[12.5px] text-fg-muted">
                  {member.department} · Member since {formatDate(member.joinedAt)}
                </p>
                <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
                  <span className="inline-flex items-center gap-1.5 text-fg-soft">
                    <Mail className="size-3.5 text-fg-faint" aria-hidden="true" />
                    {member.email}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-fg-soft">
                    <Phone className="size-3.5 text-fg-faint" aria-hidden="true" />
                    {member.phone || 'No phone provided'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-fg-soft">
                    <BadgeCheck className="size-3.5 text-fg-faint" aria-hidden="true" />
                    {member.id}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-fg-soft">
                    <CalendarDays className="size-3.5 text-fg-faint" aria-hidden="true" />
                    Last active {data.activity[0] ? relativeTime(data.activity[0].at) : '—'}
                  </span>
                </div>
                {member.notes && <p className="mt-2 text-[11.5px] text-fg-faint">Note: {member.notes}</p>}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { label: 'On loan', value: active.length, icon: BookMarked, tone: 'text-brand-300' },
              { label: 'Returned', value: returned.length, icon: BookHeart, tone: 'text-positive-400' },
              { label: 'Wishlist', value: wishlist.length, icon: Heart, tone: 'text-danger-400' },
              { label: 'Simulated fines', value: `₹${fines}`, icon: CircleDollarSign, tone: fines > 0 ? 'text-warn-400' : 'text-fg-muted' },
            ].map((stat) => (
              <div key={stat.label} className="surface-card rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-fg-muted">{stat.label}</p>
                  <stat.icon className={`size-3.5 ${stat.tone}`} aria-hidden="true" />
                </div>
                <p className="mt-1 text-[19px] leading-none font-semibold tabular-nums text-fg">{stat.value}</p>
              </div>
            ))}
          </div>

          <PasswordPanel />

          <PreferencesPanel />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Wishlist</CardTitle>
              <Badge tone="outline">{wishlist.length}</Badge>
            </CardHeader>
            <CardContent>
              {wishlist.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Heart />}
                  title="Nothing saved yet"
                  description="Use the heart icon on any book to save it here."
                  action={
                    <Button size="xs" variant="secondary" onClick={() => navigate('/app/books')}>
                      Browse books
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {wishlist.slice(0, 4).map((book) => (
                    <BookCard key={book.id} book={book} onOpen={() => setSelectedBook(book)} compact />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed entries={activity} limit={6} showActor={false} />
            </CardContent>
          </Card>
        </div>
      </div>

      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        member={member}
        onSave={async (values) => {
          const result = await updateProfile(member.id, values)
          if (!result.ok) {
            toast.error('Profile not saved', result.error)
            return false
          }
          toast.success('Profile updated', 'Your demo details were saved locally.')
          return true
        }}
      />

      <BookDetailDialog book={selectedBook} open={Boolean(selectedBook)} onOpenChange={(open) => !open && setSelectedBook(null)} />
    </div>
  )
}

function EditProfileDialog({
  open,
  onOpenChange,
  member,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: { name: string; email: string; phone?: string; department: string }
  onSave: (values: { name: string; email: string; phone: string; department: string }) => boolean | Promise<boolean>
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: member.name,
      email: member.email,
      phone: member.phone ?? '',
      department: member.department,
    },
  })

  const submit = handleSubmit(async (values) => {
    if (await onSave({ ...values, phone: values.phone.trim() })) onOpenChange(false)
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Edit profile"
      description={
          IS_API_CONFIGURED ? 'Update the details saved on your library account.' : 'Update your demo profile. No real personal information is required.'
        }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} loading={isSubmitting}>
            Save profile
          </Button>
        </>
      }
    >
      <form
        id="profile-form"
        className="space-y-4"
        noValidate
        onSubmit={submit}
      >
        <InlineAlert tone="info">
          {IS_API_CONFIGURED ? 'Changes are saved to your account on the library server.' : 'Changes apply to this demo dataset only and persist in your browser.'}
        </InlineAlert>
        <Field label="Full name" required error={errors.name?.message}>
          {(fieldProps) => <Input {...fieldProps} {...register('name')} invalid={Boolean(errors.name)} />}
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          {(fieldProps) => (
            <Input {...fieldProps} {...register('email')} type="email" invalid={Boolean(errors.email)} />
          )}
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          {(fieldProps) => <Input {...fieldProps} {...register('phone')} invalid={Boolean(errors.phone)} />}
        </Field>
        <Field label="Department" required error={errors.department?.message}>
          {(fieldProps) => (
            <Select {...fieldProps} {...register('department')} invalid={Boolean(errors.department)}>
              {[...new Set([...DEPARTMENTS, member.department])].sort().map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  )
}
