import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, LibraryBig } from 'lucide-react'
import { IS_API_CONFIGURED } from '@/config/env'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { BookDetailPanel, BookCirculationActions } from '@/components/books/BookDetailPanel'
import { BookCover } from '@/components/books/BookCover'
import { BookCard } from '@/components/books/BookCard'
import { EmptyState } from '@/components/ui/Feedback'
import { Reveal } from '@/components/animation/Reveal'
import { getAvailability } from '@/features/library/engine'
import { AvailabilityBadge } from '@/components/books/BookCard'

export function BookDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const { data, publicCatalogue } = useLibrary()
  const { isAuthenticated, can } = useAuth()
  const navigate = useNavigate()

  const book = data.books.find((item) => item.id === id)

  const related = useMemo(() => {
    if (!book) return []
    return data.books
      .filter((item) => item.id !== book.id && item.status === 'active')
      .map((item) => ({
        book: item,
        score: (item.category === book.category ? 2 : 0) +
          item.tags.filter((tag) => book.tags.includes(tag)).length +
          (item.author === book.author ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => entry.book)
  }, [book, data.books])

  if (!book) {
    return (
      <div className="container-page pt-32 pb-20">
        <EmptyState
          icon={<LibraryBig />}
          title="That title is not in the catalogue"
          description={
            IS_API_CONFIGURED && publicCatalogue.status === 'unavailable'
              ? 'The live catalogue could not be read without signing in. Sign in and open the title again.'
              : IS_API_CONFIGURED
                ? 'The book may have been archived or removed from the library.'
                : 'The book may have been archived or removed from this demo dataset.'
          }
          action={
            <Link to="/catalog">
              <Button leftIcon={<ArrowLeft />}>Back to catalogue</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const availability = getAvailability(book, data)

  return (
    <div className="relative pt-20 pb-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-96">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(167,139,250,0.12),transparent_65%)]" />
      </div>

      <div className="container-page relative">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 pt-4 pb-6 text-[12px] text-fg-muted">
          <Link to="/" className="transition-colors hover:text-fg">
            Home
          </Link>
          <span aria-hidden="true">/</span>
          <Link to="/catalog" className="transition-colors hover:text-fg">
            Catalogue
          </Link>
          <span aria-hidden="true">/</span>
          <span className="truncate font-medium text-fg-soft">{book.title}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr] lg:gap-12">
          <Reveal>
            <div className="lg:sticky lg:top-24">
              <div className="mx-auto w-[200px] overflow-hidden rounded-xl shadow-[0_30px_60px_-25px_rgba(0,0,0,0.85)] sm:w-[240px] lg:w-full">
                <BookCover book={book} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <AvailabilityBadge book={book} />
                {book.status === 'archived' && <Badge tone="neutral">Archived</Badge>}
              </div>
              <div className="mt-4 space-y-2 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-fg-muted">Shelf location</span>
                  <span className="font-medium text-fg-soft">{book.shelf}</span>
                </div>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-fg-muted">Copies</span>
                  <span className="font-medium text-fg-soft">
                    {availability.available} / {availability.total} available
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-fg-muted">Active holds</span>
                  <span className="font-medium text-fg-soft">{availability.reserved}</span>
                </div>
              </div>
              {isAuthenticated && (
                <Link to={`/app/books?book=${book.id}`} className="mt-3 block">
                  <Button variant="secondary" fullWidth rightIcon={<ArrowUpRight />}>
                    {can('books.update') ? 'Manage in dashboard' : 'Open in dashboard'}
                  </Button>
                </Link>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div>
              <Badge tone="brand">{book.category}</Badge>
              <h1 className="mt-3 font-display text-[clamp(1.9rem,4vw,2.8rem)] leading-tight font-semibold tracking-tight">
                {book.title}
              </h1>
              <p className="mt-1.5 text-[14px] text-fg-muted">
                by <span className="text-fg-soft">{book.author}</span>
              </p>

              <div className="mt-5 rounded-xl border border-white/8 bg-ink-870/50 p-4">
                <BookDetailPanel book={book} actions={isAuthenticated ? <BookCirculationActions book={book} /> : undefined} />
              </div>

              {!isAuthenticated && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-500/20 bg-brand-500/[0.06] p-4">
                  <BookOpen className="size-4 text-brand-300" aria-hidden="true" />
                  <p className="min-w-0 flex-1 text-[12.5px] text-fg-soft">
                    {IS_API_CONFIGURED ? 'Sign in to borrow this title, reserve it or add it to your wishlist.' : 'Sign in with a demo role to borrow this title, reserve it or add it to a wishlist.'}
                  </p>
                  <Button size="sm" onClick={() => navigate('/login')} rightIcon={<ArrowRight />}>
                    Sign in
                  </Button>
                </div>
              )}
            </div>
          </Reveal>
        </div>

        {related.length > 0 && (
          <section className="mt-14">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="text-[16px] font-semibold tracking-tight text-fg">Related titles</h2>
              <Link to="/catalog" className="inline-flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg">
                View catalogue <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {related.map((item) => (
                <BookCard key={item.id} book={item} onOpen={() => navigate(`/books/${item.id}`)} compact />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
