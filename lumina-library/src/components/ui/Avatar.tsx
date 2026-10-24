import { cn, hashString, initialsOf } from '@/lib/utils'

const GRADIENTS = [
  'from-brand-500/80 to-violet-500/70',
  'from-violet-500/80 to-cyan-500/60',
  'from-cyan-500/70 to-brand-500/70',
  'from-positive-500/70 to-cyan-500/60',
  'from-warn-500/70 to-danger-500/60',
  'from-brand-400/80 to-positive-500/60',
]

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11px]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-sm',
  xl: 'size-16 text-lg',
}

export function Avatar({
  name,
  size = 'md',
  className,
  ring = false,
}: {
  name: string
  size?: keyof typeof SIZES
  className?: string
  ring?: boolean
}) {
  const gradient = GRADIENTS[hashString(name) % GRADIENTS.length]
  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white/95 select-none',
        gradient,
        SIZES[size],
        ring && 'ring-2 ring-ink-900',
        className,
      )}
      aria-hidden="true"
    >
      {initialsOf(name) || '?'}
    </span>
  )
}
