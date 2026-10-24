import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success' | 'link'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon'

const base =
  'relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none no-tap-highlight ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out-soft)] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ' +
  'disabled:pointer-events-none disabled:opacity-45 active:translate-y-[0.5px]'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_8px_20px_-10px_rgba(91,140,255,0.9)] ' +
    'hover:from-brand-300 hover:to-brand-500 hover:shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_12px_28px_-10px_rgba(91,140,255,0.95)]',
  secondary:
    'bg-ink-750 text-fg border border-white/10 hover:bg-ink-700 hover:border-white/15 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]',
  outline:
    'bg-transparent text-fg-soft border border-white/14 hover:text-fg hover:border-white/25 hover:bg-white/[0.04]',
  ghost: 'bg-transparent text-fg-muted hover:text-fg hover:bg-white/[0.06]',
  danger:
    'bg-danger-600/90 text-white border border-danger-500/40 hover:bg-danger-500 shadow-[0_8px_20px_-12px_rgba(245,101,101,0.9)]',
  success:
    'bg-positive-600 text-white border border-positive-500/40 hover:bg-positive-500 shadow-[0_8px_20px_-12px_rgba(34,201,138,0.9)]',
  link: 'bg-transparent text-brand-300 hover:text-brand-200 underline-offset-4 hover:underline px-0',
}

const sizes: Record<ButtonSize, string> = {
  xs: 'h-7 rounded-md px-2.5 text-[12px] tracking-tight',
  sm: 'h-8.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 rounded-lg px-4 text-sm',
  lg: 'h-12 rounded-xl px-6 text-[15px]',
  icon: 'h-9 w-9 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

export function buttonStyles({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
} = {}) {
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon && <span className="shrink-0 [&>svg]:size-4">{leftIcon}</span>
      )}
      {children}
      {rightIcon && !loading && <span className="shrink-0 [&>svg]:size-4">{rightIcon}</span>}
    </button>
  )
})

export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'children' | 'leftIcon' | 'rightIcon'> & { label: string; children: ReactNode }
>(function IconButton({ label, size = 'icon', variant = 'ghost', className, children, ...props }, ref) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      title={label}
      size={size}
      variant={variant}
      className={cn('shrink-0', className)}
      {...props}
    >
      {children}
    </Button>
  )
})
