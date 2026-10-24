import { useId } from 'react'
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface TabItem<T extends string = string> {
  value: T
  label: ReactNode
  count?: number
  icon?: ReactNode
  disabled?: boolean
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  size = 'md',
  'aria-label': ariaLabel,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
  'aria-label'?: string
}) {
  const layoutId = useId()
  const reduced = useReducedMotion()

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-white/8 bg-ink-900/60 p-1 scrollbar-none',
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={selected}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-colors duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
              size === 'md' ? 'h-8.5 px-3 text-[13px]' : 'h-7.5 px-2.5 text-[12px]',
              selected ? 'text-fg' : 'text-fg-muted hover:text-fg-soft',
              item.disabled && 'pointer-events-none opacity-40',
            )}
          >
            {selected && (
              <motion.span
                layoutId={reduced ? undefined : `tab-${layoutId}`}
                className="absolute inset-0 rounded-lg border border-white/10 bg-ink-750 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-1 inline-flex items-center gap-1.5 whitespace-nowrap">
              {item.icon && <span className="[&>svg]:size-3.5">{item.icon}</span>}
              {item.label}
              {typeof item.count === 'number' && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-[10.5px] tabular-nums',
                    selected ? 'bg-white/10 text-fg-soft' : 'bg-white/6 text-fg-faint',
                  )}
                >
                  {item.count}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  className,
  'aria-label': ariaLabel,
}: {
  options: { value: T; label: ReactNode; icon?: ReactNode; title?: string }[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-white/10 bg-ink-900/70 p-0.5', className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-md transition-all duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
              size === 'sm' ? 'h-7 px-2 text-[12px]' : 'h-8 px-3 text-[13px]',
              selected
                ? 'bg-ink-700 text-fg shadow-[0_1px_0_rgba(255,255,255,0.07)_inset]'
                : 'text-fg-muted hover:text-fg-soft',
            )}
          >
            {option.icon && <span className="[&>svg]:size-3.5">{option.icon}</span>}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
