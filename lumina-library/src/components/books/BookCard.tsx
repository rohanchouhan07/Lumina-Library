import type { ReactNode } from 'react'
import { BookOpen, Heart, LibraryBig } from 'lucide-react'
import type { Book } from '@/types'
import { cn } from '@/lib/utils'
import { getAvailability } from '@/features/library/engine'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { Badge, StatusPill } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Menu'
import { BookCover } from './BookCover'

export function AvailabilityBadge({ book, className }: { book: Book; className?: string }) {
  const { data } = useLibrary()
  const availability = getAvailability(book, data)
  if (availability.state === 'archived')
    return <StatusPill tone="neutral" label="Archived" className={className} />
  if (availability.state === 'unavailable')
    return <StatusPill tone="danger" label="All copies out" className={className} />
  if (availability.state === 'limited')
    return (
      <StatusPill
        tone="warn"
        label={`${availability.available} of ${availability.total} left`}
        className={className}
      />
    )
  return <StatusPill tone="success" label={`${availability.available} available`} className={className} />
}

export function WishlistButton({
  book,
  className,
  size = 'md',
}: {
  book: Book
  className?: string
  size?: 'sm' | 'md'
}) {
  const { data, toggleWishlist } = useLibrary()
  const { member } = useAuth()
  const toast = useToast()
  if (!member) return null
  const list = data.wishlists[member.id] ?? []
  const saved = list.includes(book.id)

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${book.title} from wishlist` : `Add ${book.title} to wishlist`}
      onClick={async (event) => {
        event.stopPropagation()
        const result = await toggleWishlist(member.id, book.id)
        if (!result.ok) {
          toast.error('Wishlist not updated', result.error)
          return
        }
        toast.success(
          result.value ? 'Added to wishlist' : 'Removed from wishlist',
          book.title,
        )
      }}
      className={cn(
        'grid place-items-center rounded-full border backdrop-blur-md transition-all duration-200',
        size === 'sm' ? 'size-7' : 'size-8.5',
        saved
          ? 'border-danger-500/40 bg-danger-500/20 text-danger-400'
          : 'border-white/12 bg-ink-950/60 text-fg-soft hover:border-white/25 hover:text-fg',
        className,
      )}
    >
      <Heart className={cn(size === 'sm' ? 'size-3.5' : 'size-4', saved && 'fill-current')} aria-hidden="true" />
    </button>
  )
}

export function BookCard({
  book,
  onOpen,
  footer,
  compact = false,
}: {
  book: Book
  onOpen: () => void
  footer?: ReactNode
  compact?: boolean
}) {
  const { data } = useLibrary()
  const availability = getAvailability(book, data)

  return (
    <article className="group relative flex flex-col">
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-white/8 bg-ink-900/60 transition-all duration-300 ease-[var(--ease-out-soft)]',
          'group-hover:border-white/16 group-hover:shadow-lift',
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
          aria-label={`View details for ${book.title} by ${book.author}`}
        >
          <div className="relative bg-gradient-to-b from-white/[0.04] to-transparent p-3 pb-4">
            <div className="transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:-translate-y-1 group-hover:scale-[1.02]">
              <BookCover book={book} />
            </div>
            <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
              <Badge tone="neutral" className="bg-ink-950/80 backdrop-blur">
                {book.category}
              </Badge>
            </div>
          </div>

          <div className={cn('space-y-1 px-3.5 pb-3.5', compact && 'pb-3')}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 min-h-[2.3em] text-[13.5px] leading-snug font-semibold text-fg transition-colors group-hover:text-brand-200">
                {book.title}
              </h3>
            </div>
            <p className="line-clamp-1 text-[12px] text-fg-muted">{book.author}</p>
            <div className="flex items-center justify-between gap-2 pt-1.5">
              <AvailabilityBadge book={book} />
              <span className="inline-flex items-center gap-1 text-[11px] text-fg-faint">
                <LibraryBig className="size-3" aria-hidden="true" />
                {availability.available}/{availability.total}
              </span>
            </div>
          </div>
        </button>
        <div className="absolute top-3 right-3">
          <WishlistButton book={book} size="sm" />
        </div>
      </div>
      {footer && <div className="mt-2">{footer}</div>}
    </article>
  )
}

export function BookRow({
  book,
  onOpen,
  trailing,
}: {
  book: Book
  onOpen: () => void
  trailing?: ReactNode
}) {
  const { data } = useLibrary()
  const availability = getAvailability(book, data)

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-white/6 bg-ink-870/50 p-2.5 transition-colors hover:border-white/12 hover:bg-ink-870">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
      >
        <div className="w-10 shrink-0 overflow-hidden rounded-md shadow-book">
          <BookCover book={book} size="xs" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-fg group-hover:text-brand-200">{book.title}</p>
          <p className="flex items-center gap-1.5 truncate text-[11.5px] text-fg-muted">
            {book.author} · {book.category}
          </p>
        </div>
        <div className="hidden shrink-0 sm:block">
          <AvailabilityBadge book={book} />
        </div>
        <span className="hidden w-14 shrink-0 text-right text-[11px] text-fg-faint tabular-nums md:block">
          {availability.available}/{availability.total}
        </span>
      </button>
      {trailing && <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>}
    </div>
  )
}

export function BookCoverLink({ book, onClick }: { book: Book; onClick: () => void }) {
  return (
    <Tooltip content={`${book.title} — ${book.author}`}>
      <button
        type="button"
        onClick={onClick}
        className="group relative block w-full overflow-hidden rounded-lg shadow-book transition-transform duration-400 hover:-translate-y-1 hover:rotate-[-1deg] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
        aria-label={`Open ${book.title}`}
      >
        <BookCover book={book} size="sm" />
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-ink-950/95 to-transparent px-2 pt-6 pb-1.5 text-[10px] font-medium text-fg-soft opacity-0 transition-opacity group-hover:opacity-100">
          <BookOpen className="size-3" aria-hidden="true" />
          View title
        </span>
      </button>
    </Tooltip>
  )
}
