import { forwardRef, useId } from 'react'
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const controlBase =
  'w-full rounded-lg border bg-ink-950/60 text-sm text-fg placeholder:text-fg-faint ' +
  'transition-[border-color,box-shadow,background-color] duration-200 ' +
  'hover:border-white/16 focus:border-brand-500/70 focus:bg-ink-950/90 focus:outline-none ' +
  'focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-[invalid=true]:border-danger-500/70 aria-[invalid=true]:focus:ring-danger-500/20'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, type = 'text', ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        className={cn(controlBase, 'h-10 border-white/10 px-3', className)}
        {...props}
      />
    )
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(controlBase, 'min-h-[88px] resize-y border-white/10 px-3 py-2.5 leading-relaxed', className)}
      {...props}
    />
  )
})

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          controlBase,
          'h-10 appearance-none border-white/10 pr-9 pl-3',
          '[&>option]:bg-ink-900 [&>option]:text-fg',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-fg-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
})

export function Label({
  children,
  htmlFor,
  required,
  hint,
  className,
}: {
  children: ReactNode
  htmlFor?: string
  required?: boolean
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-1.5 flex items-baseline justify-between gap-2', className)}>
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-fg-soft">
        {children}
        {required && (
          <span className="ml-0.5 text-danger-400" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && <span className="text-[11px] text-fg-faint">{hint}</span>}
    </div>
  )
}

export function FieldError({ children, id }: { children?: ReactNode; id?: string }) {
  return (
    <div
      id={id}
      role={children ? 'alert' : undefined}
      className={cn(
        'grid transition-all duration-200 ease-[var(--ease-out-soft)]',
        children ? 'mt-1.5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
    >
      <div className="overflow-hidden">
        <p className="flex items-center gap-1.5 text-[12px] text-danger-400">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {children}
        </p>
      </div>
    </div>
  )
}

export function Field({
  label,
  error,
  hint,
  required,
  children,
  htmlFor,
  className,
}: {
  label?: ReactNode
  error?: string
  hint?: ReactNode
  required?: boolean
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode
  htmlFor?: string
  className?: string
}) {
  const generatedId = useId()
  const id = htmlFor ?? generatedId
  const errorId = `${id}-error`
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <Label htmlFor={id} required={required} hint={hint}>
          {label}
        </Label>
      )}
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  )
}

export function SearchInput({
  className,
  onClear,
  value,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void }) {
  return (
    <div className={cn('relative', className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-faint"
      >
        <circle cx="9" cy="9" r="5.5" />
        <path d="m13.5 13.5 3 3" strokeLinecap="round" />
      </svg>
      <Input {...props} value={value} className="pl-9.5" />
      {value && onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-fg-faint transition-colors hover:bg-white/8 hover:text-fg"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5">
            <path d="m6 6 8 8M14 6l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
