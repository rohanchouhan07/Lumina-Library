import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  description?: string
  meta?: string
  disabled?: boolean
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches found',
  disabled = false,
  id,
  invalid,
  className,
  'aria-describedby': ariaDescribedBy,
}: {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  id?: string
  invalid?: boolean
  className?: string
  'aria-describedby'?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const reduced = useReducedMotion()

  const selected = options.find((option) => option.value === value)
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return options
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(term) ||
        option.description?.toLowerCase().includes(term) ||
        option.meta?.toLowerCase().includes(term),
    )
  }, [options, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    const option = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    option?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const commit = (option: ComboboxOption) => {
    if (option.disabled) return
    onChange(option.value)
    setOpen(false)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = filtered[activeIndex]
      if (option) commit(option)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-lg border bg-ink-950/60 px-3 text-left text-sm transition-colors',
          'hover:border-white/16 focus-visible:border-brand-500/70 focus-visible:ring-2 focus-visible:ring-brand-500/25 focus-visible:outline-none',
          invalid ? 'border-danger-500/60' : 'border-white/10',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', selected ? 'text-fg' : 'text-fg-faint')}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.meta && <span className="shrink-0 text-[11px] text-fg-faint">{selected.meta}</span>}
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-fg-muted transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
            className="absolute top-full right-0 left-0 z-70 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-ink-850 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
          >
            <div className="flex items-center gap-2 border-b border-white/6 px-2.5">
              <Search className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveIndex(0)
                }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-9 w-full bg-transparent text-[13px] text-fg placeholder:text-fg-faint focus:outline-none"
              />
            </div>
            {filtered.length === 0 ? (
              <p className="px-3 py-5 text-center text-[12px] text-fg-muted">{emptyMessage}</p>
            ) : (
              <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto p-1.5">
                {filtered.map((option, index) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      data-index={index}
                      aria-selected={option.value === value}
                      disabled={option.disabled}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => commit(option)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                        index === activeIndex && 'bg-white/[0.06]',
                        option.disabled && 'cursor-not-allowed opacity-45',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-fg">{option.label}</span>
                        {option.description && (
                          <span className="block truncate text-[11px] text-fg-faint">{option.description}</span>
                        )}
                      </span>
                      {option.meta && <span className="shrink-0 text-[10.5px] text-fg-faint">{option.meta}</span>}
                      {option.value === value && <Check className="size-3.5 shrink-0 text-brand-400" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
