import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Book } from '@/types'
import { bookSchema, type BookFormValues } from '@/lib/validation'
import { CATEGORIES } from '@/data/seedData'
import { useLibrary } from '@/providers/LibraryProvider'
import { useToast } from '@/providers/ToastProvider'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { InlineAlert } from '@/components/ui/Feedback'

const emptyValues: BookFormValues = {
  title: '',
  author: '',
  isbn: '',
  publisher: '',
  year: new Date().getFullYear(),
  category: CATEGORIES[0],
  description: '',
  shelf: '',
  totalCopies: 1,
  tags: '',
}

export function BookFormDialog({
  open,
  onOpenChange,
  book,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  book?: Book | null
}) {
  const { addBook, updateBook, data } = useLibrary()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const isEdit = Boolean(book)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookFormValues>({
    resolver: zodResolver(bookSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return
    setFormError(null)
    reset(
      book
        ? {
            title: book.title,
            author: book.author,
            isbn: book.isbn,
            publisher: book.publisher,
            year: book.year,
            category: book.category,
            description: book.description,
            shelf: book.shelf,
            totalCopies: book.totalCopies,
            tags: book.tags.join(', '),
          }
        : emptyValues,
    )
  }, [open, book, reset])

  const submit = handleSubmit(async (values) => {
    setFormError(null)
    const payload = {
      title: values.title.trim(),
      author: values.author.trim(),
      isbn: values.isbn.trim(),
      publisher: values.publisher.trim(),
      year: Number(values.year),
      category: values.category,
      description: values.description.trim(),
      shelf: values.shelf.trim().toUpperCase(),
      totalCopies: Number(values.totalCopies),
      tags: values.tags
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
    }
    const result = isEdit && book ? await updateBook(book.id, payload) : await addBook(payload)
    if (!result.ok) {
      setFormError(result.error)
      toast.error(isEdit ? 'Book not updated' : 'Book not added', result.error)
      return
    }
    toast.success(
      isEdit ? 'Book updated' : 'Book added to catalogue',
      `${result.value.title} · ${result.value.totalCopies} ${result.value.totalCopies === 1 ? 'copy' : 'copies'}`,
    )
    onOpenChange(false)
  })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Edit book record' : 'Add a new book'}
      description={
        isEdit
          ? 'Availability is derived from copy counts and active loans — adjust copies carefully.'
          : 'New titles are immediately available in the catalogue and the public discovery page.'
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          {/* Not a native submit button: sandboxed previews block form submission. */}
          <Button type="button" onClick={submit} loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Add book'}
          </Button>
        </>
      }
    >
      <form id="book-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required error={errors.title?.message} className="sm:col-span-2">
            {(fieldProps) => (
              <Input {...fieldProps} {...register('title')} invalid={Boolean(errors.title)} placeholder="Clean Code" />
            )}
          </Field>

          <Field label="Author" required error={errors.author?.message}>
            {(fieldProps) => (
              <Input {...fieldProps} {...register('author')} invalid={Boolean(errors.author)} placeholder="Robert C. Martin" />
            )}
          </Field>

          <Field label="ISBN" error={errors.isbn?.message} hint="Optional">
            {(fieldProps) => (
              <Input {...fieldProps} {...register('isbn')} invalid={Boolean(errors.isbn)} placeholder="978-0132350884" />
            )}
          </Field>

          <Field label="Publisher" required error={errors.publisher?.message}>
            {(fieldProps) => (
              <Input {...fieldProps} {...register('publisher')} invalid={Boolean(errors.publisher)} placeholder="Prentice Hall" />
            )}
          </Field>

          <Field label="Publication year" required error={errors.year?.message}>
            {(fieldProps) => (
              <Input {...fieldProps} {...register('year')} type="number" invalid={Boolean(errors.year)} placeholder="2008" />
            )}
          </Field>

          <Field label="Category" required error={errors.category?.message}>
            {(fieldProps) => (
              <Select {...fieldProps} {...register('category')} invalid={Boolean(errors.category)}>
                {[...CATEGORIES, ...data.books.map((b) => b.category)]
                  .filter((value, index, list) => list.indexOf(value) === index)
                  .sort()
                  .map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
              </Select>
            )}
          </Field>

          <Field label="Shelf / location" required error={errors.shelf?.message}>
            {(fieldProps) => (
              <Input {...fieldProps} {...register('shelf')} invalid={Boolean(errors.shelf)} placeholder="CS-A-01" />
            )}
          </Field>

          <Field
            label="Total copies"
            required
            error={errors.totalCopies?.message}
            hint={isEdit ? 'Cannot be below active loans' : 'At least 1'}
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                {...register('totalCopies')}
                type="number"
                min={1}
                invalid={Boolean(errors.totalCopies)}
              />
            )}
          </Field>

          <Field label="Tags" error={errors.tags?.message} hint="Comma separated" className="sm:col-span-2">
            {(fieldProps) => (
              <Input {...fieldProps} {...register('tags')} invalid={Boolean(errors.tags)} placeholder="algorithms, complexity" />
            )}
          </Field>

          <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
            {(fieldProps) => (
              <Textarea
                {...fieldProps}
                {...register('description')}
                invalid={Boolean(errors.description)}
                placeholder="Short summary used on catalogue cards and the details page."
              />
            )}
          </Field>
        </div>
      </form>
    </Dialog>
  )
}
