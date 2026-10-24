import { z } from 'zod'

const currentYear = new Date().getFullYear()

const trimmed = (label: string, min = 1, max = 160) =>
  z
    .string()
    .trim()
    .min(min, min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be under ${max} characters`)

export const bookSchema = z.object({
  title: trimmed('Title', 2, 140),
  author: trimmed('Author', 2, 120),
  isbn: z
    .string()
    .trim()
    .max(24, 'ISBN must be under 24 characters')
    .refine((value) => value === '' || /^(97[89][-\s]?)?[\d-\sXx]{9,20}$/.test(value), {
      message: 'Enter a valid ISBN-10 or ISBN-13',
    }),
  publisher: trimmed('Publisher', 2, 100),
  year: z.coerce
    .number({ invalid_type_error: 'Enter a publication year' })
    .int('Year must be a whole number')
    .min(1400, 'Year must be after 1400')
    .max(currentYear + 1, `Year cannot be after ${currentYear + 1}`),
  category: trimmed('Category', 1, 60),
  description: z.string().trim().max(1200, 'Description must be under 1200 characters'),
  shelf: trimmed('Shelf code', 1, 20),
  totalCopies: z.coerce
    .number({ invalid_type_error: 'Enter the number of copies' })
    .int('Copies must be a whole number')
    .min(1, 'At least one copy is required')
    .max(200, 'Copy count must be 200 or less'),
  tags: z.string().trim().max(160, 'Tags must be under 160 characters'),
})

export type BookFormValues = z.infer<typeof bookSchema>

export const memberSchema = z.object({
  name: trimmed('Full name', 2, 100),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email address')
    .max(120, 'Email must be under 120 characters'),
  institutionalId: z
    .string()
    .trim()
    .max(40, 'Institutional ID must be under 40 characters')
    .optional(),
  department: trimmed('Department', 1, 80),
  role: z.enum(['admin', 'librarian', 'faculty', 'student'], { errorMap: () => ({ message: 'Select a role' }) }),
  status: z.enum(['active', 'inactive']),
  phone: z
    .string()
    .trim()
    .max(24, 'Phone must be under 24 characters')
    .refine((value) => value === '' || /^[+\d][\d\s-()]{6,20}$/.test(value), {
      message: 'Enter a valid phone number',
    }),
  borrowingLimit: z
    .string()
    .trim()
    .refine((value) => value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 20), {
      message: 'Limit must be between 1 and 20',
    }),
  notes: z.string().trim().max(300, 'Notes must be under 300 characters'),
})

export type MemberFormValues = z.infer<typeof memberSchema>

export const issueSchema = z.object({
  memberId: trimmed('Member', 1),
  bookId: trimmed('Book', 1),
  loanDays: z.coerce.number().int().min(1, 'Loan must be at least 1 day').max(90, 'Loan cannot exceed 90 days'),
})

export type IssueFormValues = z.infer<typeof issueSchema>

export const configSchema = z.object({
  libraryName: trimmed('Library name', 2, 80),
  loanDurationDays: z.coerce.number().int().min(1, 'Minimum 1 day').max(90, 'Maximum 90 days'),
  maxRenewals: z.coerce.number().int().min(0, 'Cannot be negative').max(5, 'Maximum 5 renewals'),
  renewalExtensionDays: z.coerce.number().int().min(1, 'Minimum 1 day').max(60, 'Maximum 60 days'),
  finePerDay: z.coerce.number().min(0, 'Cannot be negative').max(500, 'Maximum ₹500 per day'),
  studentBorrowLimit: z.coerce.number().int().min(1, 'Minimum 1 book').max(20, 'Maximum 20 books'),
  staffBorrowLimit: z.coerce.number().int().min(1, 'Minimum 1 book').max(30, 'Maximum 30 books'),
  reservationHoldDays: z.coerce.number().int().min(1, 'Minimum 1 day').max(30, 'Maximum 30 days'),
  fineBlockThreshold: z.coerce.number().min(0, 'Cannot be negative').max(10000, 'Maximum ₹10,000'),
  blockIssueOnUnpaidFines: z.boolean(),
  allowStudentSelfCheckout: z.boolean(),
})

export type ConfigFormValues = z.infer<typeof configSchema>

export const profileSchema = z.object({
  name: trimmed('Full name', 2, 100),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .max(24, 'Phone must be under 24 characters')
    .refine((value) => value === '' || /^[+\d][\d\s-()]{6,20}$/.test(value), {
      message: 'Enter a valid phone number',
    }),
  department: trimmed('Department', 1, 80),
})

export type ProfileFormValues = z.infer<typeof profileSchema>

/** Friendlier duplicate checks used by the feature layer. */
export function findDuplicateMember<T extends { id: string; email: string }>(
  members: T[],
  email: string,
  ignoreId?: string,
): T | undefined {
  const normalised = email.trim().toLowerCase()
  return members.find((m) => m.id !== ignoreId && m.email.trim().toLowerCase() === normalised)
}

export function findDuplicateBook<T extends { id: string; isbn: string; title: string; author: string }>(
  books: T[],
  values: { isbn: string; title: string; author: string },
  ignoreId?: string,
): T | undefined {
  const isbn = values.isbn.replace(/[-\s]/g, '')
  if (isbn) {
    const match = books.find((b) => b.id !== ignoreId && b.isbn.replace(/[-\s]/g, '') === isbn)
    if (match) return match
  }
  const title = values.title.trim().toLowerCase()
  const author = values.author.trim().toLowerCase()
  return books.find(
    (b) => b.id !== ignoreId && b.title.trim().toLowerCase() === title && b.author.trim().toLowerCase() === author,
  )
}
