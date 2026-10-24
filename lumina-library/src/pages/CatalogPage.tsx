import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Filter, LayoutGrid, LibraryBig, List, RotateCcw } from 'lucide-react'
import { IS_API_CONFIGURED } from '@/config/env'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useCatalog } from '@/hooks/useCatalog'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SearchInput, Select } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/Feedback'
import { BookCard, BookRow } from '@/components/books/BookCard'
import { BookDetailDialog } from '@/components/books/BookDetailDialog'
import { Reveal } from '@/components/animation/Reveal'
import type { Book } from '@/types'

const PAGE_SIZE = 12

export function CatalogPage() {
  const { data, stats } = useLibrary()
  const { isAuthenticated } = useAuth()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<Book | null>(null)

  const publicBooks = useMemo(() => data.books.filter((book) => book.status === 'active'), [data.books])
  const categories = useMemo(
    () => Array.from(new Set(publicBooks.map((book) => book.category))).sort(),
    [publicBooks],
  )

  const { filters, setFilters, results } = useCatalog(publicBooks, data)

  const visible = results.slice(0, visibleCount)
  const hasMore = results.length > visibleCount
  const activeFilterCount =
    (filters.category !== 'all' ? 1 : 0) +
    (filters.availability !== 'all' ? 1 : 0) +
    (filters.sort !== 'relevance' ? 1 : 0)

  const reset = () => {
    setFilters({ query: '', category: 'all', availability: 'all', sort: 'relevance' })
    setVisibleCount(PAGE_SIZE)
  }

  return (
    <div className="relative pt-24 pb-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[26rem]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(91,140,255,0.14),transparent_65%)]" />
      </div>

      <div className="container-page relative">
        <Reveal>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Badge tone="brand" className="mb-3">
                <LibraryBig className="size-3" aria-hidden="true" /> Public catalogue
              </Badge>
              <h1 className="font-display text-[clamp(2rem,4.5vw,3rem)] leading-tight font-semibold tracking-tight">
                Browse the collection
              </h1>
              <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-fg-muted">
                {stats.totalTitles} titles across seven subject areas · {stats.availableCopies} copies available today.
                Sign in to borrow or reserve a title.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isAuthenticated ? (
                <Link to="/app/books">
                  <Button rightIcon={<ArrowRight />}>Open dashboard</Button>
                </Link>
              ) : (
                <>
                  <Link to="/login">
                    <Button rightIcon={<ArrowRight />}>Sign in to borrow</Button>
                  </Link>
                  <Link to="/">
                    <Button variant="secondary">Back home</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </Reveal>

        <div className="sticky top-16 z-30 -mx-3 mt-6 border-y border-white/6 bg-ink-950/85 px-3 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-xl sm:border sm:px-3.5">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            <SearchInput
              value={filters.query}
              onChange={(event) => {
                setFilters({ ...filters, query: event.target.value })
                setVisibleCount(PAGE_SIZE)
              }}
              onClear={() => setFilters({ ...filters, query: '' })}
              placeholder="Search title, author, ISBN, category…"
              aria-label="Search catalogue"
              className="w-full lg:max-w-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={filters.category}
                onChange={(event) => {
                  setFilters({ ...filters, category: event.target.value })
                  setVisibleCount(PAGE_SIZE)
                }}
                aria-label="Filter by category"
                className="w-auto min-w-36"
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
              <Select
                value={filters.availability}
                onChange={(event) => {
                  setFilters({ ...filters, availability: event.target.value as typeof filters.availability })
                  setVisibleCount(PAGE_SIZE)
                }}
                aria-label="Filter by availability"
                className="w-auto min-w-32"
              >
                <option value="all">Any status</option>
                <option value="available">Available now</option>
                <option value="unavailable">All copies out</option>
              </Select>
              <Select
                value={filters.sort}
                onChange={(event) => setFilters({ ...filters, sort: event.target.value as typeof filters.sort })}
                aria-label="Sort results"
                className="w-auto min-w-36"
              >
                <option value="relevance">Sort: Relevant</option>
                <option value="title">Sort: Title</option>
                <option value="author">Sort: Author</option>
                <option value="newest">Sort: Newest</option>
                <option value="availability">Sort: Available</option>
              </Select>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" leftIcon={<RotateCcw />} onClick={reset}>
                  Reset
                </Button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden text-[11.5px] text-fg-muted sm:block">
                  {results.length} {results.length === 1 ? 'title' : 'titles'}
                </span>
                <SegmentedControl<'grid' | 'list'>
                  aria-label="View mode"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'grid', label: '', icon: <LayoutGrid />, title: 'Grid view' },
                    { value: 'list', label: '', icon: <List />, title: 'List view' },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          {results.length === 0 ? (
            <EmptyState
              icon={filters.query ? <Filter /> : <BookOpen />}
              title={filters.query ? `No titles match “${filters.query}”` : 'No titles match these filters'}
              description="Try removing a filter or searching for a different author, category or ISBN."
              action={
                <Button variant="secondary" size="sm" leftIcon={<RotateCcw />} onClick={reset}>
                  Clear filters
                </Button>
              }
            />
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visible.map((book) => (
                <BookCard key={book.id} book={book} onOpen={() => setSelected(book)} />
              ))}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {visible.map((book) => (
                <li key={book.id}>
                  <BookRow book={book} onOpen={() => setSelected(book)} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          {hasMore ? (
            <Button variant="secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
              Load more titles
            </Button>
          ) : (
            results.length > 0 && (
              <p className="text-[11.5px] text-fg-faint">
                Showing all {results.length} matching titles
              </p>
            )
          )}
          {!isAuthenticated && results.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
              <span className="text-[12px] text-fg-muted">Want to borrow one of these?</span>
              <Link to="/login">
                <Button size="sm" variant="secondary" rightIcon={<ArrowRight />}>
                  {IS_API_CONFIGURED ? 'Sign in to borrow or reserve' : 'Sign in with a demo role'}
                </Button>
              </Link>
            </div>
          )}
        </div>

        <p className="mt-10 text-center text-[11px] text-fg-faint">
          {IS_API_CONFIGURED
            ? 'Catalogue read from the library spreadsheet · availability reflects active loans'
            : 'Sample catalogue supplied with the Lumina demo · availability reflects active demo loans'}
        </p>
      </div>

      <BookDetailDialog book={selected} open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  )
}
