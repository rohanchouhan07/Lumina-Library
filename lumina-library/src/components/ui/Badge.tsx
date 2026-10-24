import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type BadgeTone = 'neutral' | 'brand' | 'violet' | 'cyan' | 'success' | 'warn' | 'danger' | 'outline'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-white/[0.06] text-fg-soft border-white/10',
  brand: 'bg-brand-500/12 text-brand-300 border-brand-500/25',
  violet: 'bg-violet-500/12 text-violet-400 border-violet-500/25',
  cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25',
  success: 'bg-positive-500/12 text-positive-400 border-positive-500/25',
  warn: 'bg-warn-500/12 text-warn-400 border-warn-500/25',
  danger: 'bg-danger-500/12 text-danger-400 border-danger-500/30',
  outline: 'bg-transparent text-fg-muted border-white/14',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  size?: 'sm' | 'md'
  icon?: ReactNode
  dot?: boolean
}

export function Badge({ tone = 'neutral', size = 'sm', icon, dot, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px] leading-4' : 'px-2.5 py-1 text-xs',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {icon && <span className="[&>svg]:size-3">{icon}</span>}
      {children}
    </span>
  )
}

/** Status dot + label — status is never conveyed by colour alone. */
export function StatusPill({
  tone,
  label,
  className,
  pulse = false,
}: {
  tone: BadgeTone
  label: string
  className?: string
  pulse?: boolean
}) {
  const dotColor: Record<BadgeTone, string> = {
    neutral: 'bg-fg-muted',
    brand: 'bg-brand-400',
    violet: 'bg-violet-400',
    cyan: 'bg-cyan-400',
    success: 'bg-positive-400',
    warn: 'bg-warn-400',
    danger: 'bg-danger-400',
    outline: 'bg-fg-muted',
  }
  return (
    <Badge tone={tone} className={className}>
      <span className="relative flex size-1.5 items-center justify-center" aria-hidden="true">
        {pulse && (
          <span className={cn('absolute inline-flex size-2 rounded-full opacity-70 animate-pulse-ring', dotColor[tone])} />
        )}
        <span className={cn('size-1.5 rounded-full', dotColor[tone])} />
      </span>
      {label}
    </Badge>
  )
}
