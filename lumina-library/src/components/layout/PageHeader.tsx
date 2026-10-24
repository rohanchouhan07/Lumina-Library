import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  eyebrow?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-5 space-y-4', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-brand-300/90 uppercase">
              {eyebrow}
            </div>
          )}
          <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-fg sm:text-[26px]">
            {title}
          </h1>
          {description && <p className="mt-1 max-w-2xl text-[13px] text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
