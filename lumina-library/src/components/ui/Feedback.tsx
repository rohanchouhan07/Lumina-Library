import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex', className)}>
      <Loader2 className="size-4 animate-spin text-fg-muted" aria-hidden="true" />
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer-bg rounded-md', className)} aria-hidden="true" />
}

export function Progress({
  value,
  max = 100,
  tone = 'brand',
  label,
  showValue = false,
  className,
}: {
  value: number
  max?: number
  tone?: 'brand' | 'violet' | 'cyan' | 'success' | 'warn' | 'danger'
  label?: string
  showValue?: boolean
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const tones: Record<string, string> = {
    brand: 'from-brand-500 to-brand-400',
    violet: 'from-violet-600 to-violet-400',
    cyan: 'from-cyan-600 to-cyan-400',
    success: 'from-positive-600 to-positive-400',
    warn: 'from-warn-600 to-warn-400',
    danger: 'from-danger-600 to-danger-400',
  }
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {label && <span className="text-[11.5px] text-fg-muted">{label}</span>}
          {showValue && <span className="text-[11.5px] font-medium tabular-nums text-fg-soft">{Math.round(pct)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/8"
      >
        <motion.div
          className={cn('h-full rounded-full bg-gradient-to-r', tones[tone])}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.015] text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      {icon && (
        <div className="grid size-11 place-items-center rounded-xl border border-white/8 bg-white/[0.04] text-fg-muted [&>svg]:size-5">
          {icon}
        </div>
      )}
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-fg-soft">{title}</p>
        {description && <p className="text-[13px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </motion.div>
  )
}

export function InlineAlert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'success' | 'warn' | 'danger'
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const config = {
    info: { icon: Info, cls: 'border-brand-500/25 bg-brand-500/8 text-brand-200', iconCls: 'text-brand-300' },
    success: {
      icon: CheckCircle2,
      cls: 'border-positive-500/25 bg-positive-500/8 text-positive-400',
      iconCls: 'text-positive-400',
    },
    warn: { icon: AlertTriangle, cls: 'border-warn-500/25 bg-warn-500/8 text-warn-300', iconCls: 'text-warn-400' },
    danger: { icon: XCircle, cls: 'border-danger-500/25 bg-danger-500/8 text-danger-300', iconCls: 'text-danger-400' },
  }[tone]
  const Icon = config.icon
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px]', config.cls, className)}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', config.iconCls)} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-fg-soft/90 leading-relaxed">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <EmptyState
      icon={<AlertTriangle />}
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  )
}
