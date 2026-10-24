import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BookOpen, CornerDownLeft, Search, UserRound, X } from 'lucide-react'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'
import { getAvailability } from '@/features/library/engine'

interface Result {
  id: string
  kind: 'book' | 'member'
  title: string
  subtitle: string
  meta?: string
  href: string
}

export function GlobalSearch() {
  const { data } = useLibrary()
  const { can, member } = useAuth()
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (event.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const results = useMemo<Result[]>(() => {
    const term = query.trim().toLowerCase()
    if (term.length < 2) return []
    const books = data.books
      .filter((book) => book.status === 'active')
      .filter(
        (book) =>
          book.title.toLowerCase().includes(term) ||
          book.author.toLowerCase().includes(term) ||
          book.isbn.toLowerCase().includes(term) ||
          book.category.toLowerCase().includes(term),
      )
      .slice(0, 5)
      .map<Result>((book) => {
        const availability = getAvailability(book, data)
        return {
          id: book.id,
          kind: 'book',
          title: book.title,
          subtitle: `${book.author} · ${book.category}`,
          meta: availability.available > 0 ? `${availability.available} available` : 'All copies out',
          href: `/app/books?book=${book.id}`,
        }
      })

    const members = can('members.viewAll')
      ? data.members
          .filter(
            (item) =>
              item.name.toLowerCase().includes(term) ||
              item.email.toLowerCase().includes(term) ||
              item.id.toLowerCase().includes(term),
          )
          .slice(0, 4)
          .map<Result>((item) => ({
            id: item.id,
            kind: 'member',
            title: item.name,
            subtitle: `${item.id} · ${item.department}`,
            meta: item.role,
            href: `/app/members?member=${item.id}`,
          }))
      : []

    return [...books, ...members]
  }, [query, data, can])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const go = (result: Result) => {
    navigate(result.href)
    setQuery('')
    setOpen(false)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(results[activeIndex])
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div
        className={cn(
          'flex h-9.5 items-center gap-2 rounded-lg border bg-ink-950/50 px-3 transition-colors',
          open ? 'border-brand-500/50 ring-2 ring-brand-500/15' : 'border-white/10 hover:border-white/16',
        )}
      >
        <Search className="size-4 shrink-0 text-fg-faint" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            member ? 'Search books, authors, members…' : 'Search the catalogue…'
          }
          aria-label="Global search"
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
            className="rounded p-0.5 text-fg-faint hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-fg-faint sm:block">
            ⌘K
          </kbd>
        )}
      </div>

      <AnimatePresence>
        {open && query.trim().length >= 2 && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-full left-0 z-80 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-850/98 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
            role="listbox"
            aria-label="Search results"
          >
            {results.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-[13px] text-fg-soft">No matches for “{query}”</p>
                <p className="mt-0.5 text-[11.5px] text-fg-faint">Try a title, author, ISBN or member name.</p>
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto p-1.5">
                {results.map((result, index) => (
                  <li key={`${result.kind}-${result.id}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(result)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                        index === activeIndex ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-white/8 bg-white/[0.04] text-fg-muted">
                        {result.kind === 'book' ? (
                          <BookOpen className="size-3.5" aria-hidden="true" />
                        ) : (
                          <UserRound className="size-3.5" aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-fg">{result.title}</span>
                        <span className="block truncate text-[11.5px] text-fg-muted">{result.subtitle}</span>
                      </span>
                      {result.meta && (
                        <span className="shrink-0 text-[10.5px] text-fg-faint capitalize">{result.meta}</span>
                      )}
                      <ArrowRight className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between border-t border-white/6 px-3 py-1.5 text-[10.5px] text-fg-faint">
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft className="size-3" aria-hidden="true" /> to open
              </span>
              <span>↑ ↓ to navigate</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
