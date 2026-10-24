import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ArrowRight, BookOpen, UserRound } from 'lucide-react'
import { issueSchema, type IssueFormValues } from '@/lib/validation'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import {
  canIssue,
  getAvailability,
  memberActiveLoans,
  memberBorrowLimit,
  memberOutstandingFines,
} from '@/features/library/engine'
import { addDaysISO, formatDate } from '@/lib/dateUtils'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { InlineAlert } from '@/components/ui/Feedback'

export function IssueDialog({
  open,
  onOpenChange,
  presetBookId,
  presetMemberId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  presetBookId?: string
  presetMemberId?: string
}) {
  const { data, issueLoan } = useLibrary()
  const { member: currentUser } = useAuth()
  const toast = useToast()

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<IssueFormValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: {
      memberId: presetMemberId ?? '',
      bookId: presetBookId ?? '',
      loanDays: data.config.loanDurationDays,
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      memberId: presetMemberId ?? '',
      bookId: presetBookId ?? '',
      loanDays: data.config.loanDurationDays,
    })
  }, [open, presetBookId, presetMemberId, data.config.loanDurationDays, reset])

  const memberId = watch('memberId')
  const bookId = watch('bookId')
  const loanDays = watch('loanDays')

  const selectedMember = data.members.find((item) => item.id === memberId)
  const selectedBook = data.books.find((item) => item.id === bookId)

  const memberOptions = useMemo(
    () =>
      [...data.members]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({
          value: item.id,
          label: item.name,
          description: `${item.id} · ${item.department}`,
          meta: item.status === 'inactive' ? 'inactive' : `${memberActiveLoans(data, item.id).length} on loan`,
          disabled: item.status !== 'active',
        })),
    [data],
  )

  const bookOptions = useMemo(
    () =>
      [...data.books]
        .filter((book) => book.status === 'active')
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((book) => {
          const availability = getAvailability(book, data)
          return {
            value: book.id,
            label: book.title,
            description: `${book.author} · ${book.shelf}`,
            meta: availability.available > 0 ? `${availability.available} free` : 'none free',
            disabled: availability.available === 0,
          }
        }),
    [data],
  )

  const eligibility =
    selectedMember && selectedBook ? canIssue(data, selectedBook, selectedMember) : null

  const preview = useMemo(() => {
    if (!selectedMember) return null
    const limit = memberBorrowLimit(selectedMember, data.config)
    const active = memberActiveLoans(data, selectedMember.id).length
    const fines = memberOutstandingFines(data, selectedMember.id)
    return { limit, active, fines }
  }, [selectedMember, data])

  const submit = handleSubmit(async (values) => {
    const result = await issueLoan({
      bookId: values.bookId,
      memberId: values.memberId,
      days: Number(values.loanDays),
    })
    if (!result.ok) {
      toast.error('Book not issued', result.error)
      return
    }
    const due = formatDate(result.value.dueAt)
    toast.success(
      'Book issued successfully',
      `${selectedBook?.title ?? 'Copy'} → ${selectedMember?.name ?? 'member'} · due ${due}`,
    )
    onOpenChange(false)
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Issue a book"
      description="Select an eligible member and an available copy. Limits and fines are validated before the loan is created."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            loading={isSubmitting}
            disabled={!eligibility?.ok}
            leftIcon={<ArrowRight />}
          >
            Issue book
          </Button>
        </>
      }
    >
      <form id="issue-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Member" required error={errors.memberId?.message}>
          {(fieldProps) => (
            <Controller
              control={control}
              name="memberId"
              render={({ field }) => (
                <Combobox
                  {...fieldProps}
                  options={memberOptions}
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value)
                    // Clear a book the member already holds.
                    const book = data.books.find((b) => b.id === watch('bookId'))
                    if (
                      book &&
                      data.loans.some(
                        (loan) =>
                          loan.memberId === value && loan.bookId === book.id && loan.status === 'active',
                      )
                    ) {
                      setValue('bookId', '')
                    }
                  }}
                  placeholder="Search by name or member ID"
                  searchPlaceholder="Search members…"
                  invalid={Boolean(errors.memberId)}
                />
              )}
            />
          )}
        </Field>

        <Field label="Book" required error={errors.bookId?.message}>
          {(fieldProps) => (
            <Controller
              control={control}
              name="bookId"
              render={({ field }) => (
                <Combobox
                  {...fieldProps}
                  options={bookOptions}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Search by title, author or shelf"
                  searchPlaceholder="Search books…"
                  invalid={Boolean(errors.bookId)}
                />
              )}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Loan length (days)" required error={errors.loanDays?.message}>
            {(fieldProps) => (
              <Input {...fieldProps} {...register('loanDays')} type="number" min={1} max={90} />
            )}
          </Field>
          <div className="rounded-lg border border-white/8 bg-ink-950/40 px-3 py-2">
            <p className="text-[10.5px] font-medium tracking-[0.08em] text-fg-faint uppercase">Due date</p>
            <p className="mt-0.5 text-[13px] font-medium text-fg">
              {formatDate(addDaysISO(new Date().toISOString(), Number(loanDays) || data.config.loanDurationDays))}
            </p>
          </div>
        </div>

        {selectedMember && preview && (
          <div className="rounded-lg border border-white/8 bg-ink-950/40 p-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-fg-soft">
              <UserRound className="size-3.5" aria-hidden="true" />
              {selectedMember.name}
              <span className="font-normal text-fg-faint">
                · {preview.active}/{preview.limit} books on loan
              </span>
            </p>
            {preview.fines > 0 && (
              <p className="mt-1 text-[11px] text-warn-400">₹{preview.fines} simulated fines outstanding</p>
            )}
          </div>
        )}

        {selectedBook && (
          <div className="rounded-lg border border-white/8 bg-ink-950/40 p-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-fg-soft">
              <BookOpen className="size-3.5" aria-hidden="true" />
              {selectedBook.title}
              <span className="font-normal text-fg-faint">
                · {getAvailability(selectedBook, data).available} of {selectedBook.totalCopies} available
              </span>
            </p>
          </div>
        )}

        {eligibility && !eligibility.ok && (
          <InlineAlert tone="danger" title="Not eligible for issue">
            {eligibility.error}
          </InlineAlert>
        )}

        {currentUser?.role === 'student' && (
          <InlineAlert tone="info">
            You are signed in as a student. Staff permissions apply in this demo only after switching roles.
          </InlineAlert>
        )}

        {!selectedMember && !selectedBook && (
          <p className="flex items-center gap-1.5 text-[11.5px] text-fg-faint">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            Availability updates instantly after a successful issue.
          </p>
        )}
      </form>
    </Dialog>
  )
}
