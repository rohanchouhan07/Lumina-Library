import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AnimatedNumber } from '@/components/animation/Reveal'
import { cn } from '@/lib/utils'

const TONES = {
  brand: 'from-brand-500/16 text-brand-300 border-brand-500/22',
  violet: 'from-violet-500/16 text-violet-400 border-violet-500/22',
  cyan: 'from-cyan-500/14 text-cyan-400 border-cyan-500/22',
  success: 'from-positive-500/14 text-positive-400 border-positive-500/22',
  warn: 'from-warn-500/14 text-warn-400 border-warn-500/22',
  danger: 'from-danger-500/14 text-danger-400 border-danger-500/22',
  neutral: 'from-white/8 text-fg-soft border-white/10',
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'brand',
  hint,
  delta,
  prefix,
  suffix,
  footer,
  onClick,
  className,
}: {
  label: string
  value: number
  icon?: LucideIcon
  tone?: keyof typeof TONES
  hint?: string
  delta?: { value: number; label?: string }
  prefix?: string
  suffix?: string
  footer?: ReactNode
  onClick?: () => void
  className?: string
}) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'surface-card group relative overflow-hidden rounded-xl p-4 text-left transition-all duration-300',
        onClick &&
          'hover:-translate-y-0.5 hover:border-white/14 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -top-14 -right-10 size-32 rounded-full bg-gradient-to-br to-transparent opacity-70 blur-2xl',
          TONES[tone].split(' ')[0],
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-medium tracking-wide text-fg-muted">{label}</p>
        {Icon && (
          <span className={cn('grid size-7 shrink-0 place-items-center rounded-md border', TONES[tone])}>
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="mt-2 text-[26px] leading-none font-semibold tracking-tight text-fg">
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
      </p>
      <div className="mt-2 flex items-center gap-2">
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium',
              delta.value >= 0 ? 'bg-positive-500/10 text-positive-400' : 'bg-danger-500/10 text-danger-400',
            )}
          >
            {delta.value >= 0 ? (
              <ArrowUpRight className="size-3" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="size-3" aria-hidden="true" />
            )}
            {Math.abs(delta.value)}%
            {delta.label && <span className="text-fg-faint">{delta.label}</span>}
          </span>
        )}
        {hint && <p className="truncate text-[11px] text-fg-faint">{hint}</p>}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </Wrapper>
  )
}
