import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function Popover({
  trigger,
  children,
  align = 'end',
  side = 'bottom',
  className,
  panelClassName,
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  align?: 'start' | 'end' | 'center'
  side?: 'bottom' | 'top'
  className?: string
  panelClassName?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v), ref: triggerRef })}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label={label}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: side === 'bottom' ? -6 : 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: side === 'bottom' ? -4 : 4, scale: 0.985 }}
            transition={{ duration: reduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'absolute z-60 mt-2 min-w-52 origin-top overflow-hidden rounded-xl border border-white/10 bg-ink-850/98 p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl',
              side === 'bottom' ? 'top-full' : 'bottom-full mb-2',
              align === 'end' ? 'right-0' : align === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2',
              panelClassName,
            )}
          >
            {typeof children === 'function' ? children(() => setOpen(false)) : children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function MenuItem({
  icon,
  children,
  onClick,
  destructive = false,
  disabled = false,
  description,
  shortcut,
}: {
  icon?: ReactNode
  children: ReactNode
  onClick?: () => void
  destructive?: boolean
  disabled?: boolean
  description?: string
  shortcut?: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-400',
        destructive
          ? 'text-danger-400 hover:bg-danger-500/10'
          : 'text-fg-soft hover:bg-white/[0.06] hover:text-fg',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {icon && <span className="shrink-0 [&>svg]:size-4">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {description && <span className="block truncate text-[11px] text-fg-faint">{description}</span>}
      </span>
      {shortcut && <kbd className="ml-auto text-[10px] text-fg-faint">{shortcut}</kbd>}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-white/6" role="separator" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-[0.14em] text-fg-faint uppercase">{children}</div>
}

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'right'
  className?: string
}) {
  const id = useId()
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-70 w-max max-w-56 rounded-md border border-white/10 bg-ink-750 px-2 py-1 text-[11.5px] leading-snug text-fg-soft opacity-0 shadow-lg transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          side === 'top' && 'bottom-full left-1/2 mb-2 -translate-x-1/2',
          side === 'bottom' && 'top-full left-1/2 mt-2 -translate-x-1/2',
          side === 'right' && 'top-1/2 left-full ml-2 -translate-y-1/2',
        )}
      >
        {content}
      </span>
    </span>
  )
}
