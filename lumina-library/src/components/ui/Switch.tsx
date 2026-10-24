import { cn } from '@/lib/utils'

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  id?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={cn('block text-[13px] font-medium text-fg-soft', !disabled && 'cursor-pointer')}
        >
          {label}
        </label>
        {description && <p className="mt-0.5 text-[12px] leading-relaxed text-fg-faint">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5.5 w-10 shrink-0 rounded-full border transition-colors duration-250',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
          checked
            ? 'border-brand-500/50 bg-brand-500/80'
            : 'border-white/12 bg-ink-700 hover:bg-ink-600',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-250 ease-[var(--ease-out-soft)]',
            checked && 'translate-x-4.5',
          )}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  id?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
          checked ? 'border-brand-500 bg-brand-500 text-white' : 'border-white/20 bg-ink-950/50',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="min-w-0">
        <label
          htmlFor={id}
          onClick={() => !disabled && onChange(!checked)}
          className={cn('block text-[13px] text-fg-soft', !disabled && 'cursor-pointer')}
        >
          {label}
        </label>
        {description && <p className="mt-0.5 text-[12px] text-fg-faint">{description}</p>}
      </div>
    </div>
  )
}
