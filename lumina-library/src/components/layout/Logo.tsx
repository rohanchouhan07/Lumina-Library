import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('size-9', className)} aria-hidden="true">
      <defs>
        <linearGradient id="lumina-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#82A5FF" />
          <stop offset="55%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#42D9F5" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="13" fill="#10141D" stroke="rgba(255,255,255,0.1)" />
      <path
        d="M12 16.5c0-1.4 1.1-2.5 2.5-2.5H20c2.2 0 4 1.8 4 4v16.5c-.9-1.5-2.5-2.4-4.3-2.4h-5.2c-1.4 0-2.5-1.1-2.5-2.5V16.5Z"
        fill="url(#lumina-mark)"
      />
      <path
        d="M36 16.5c0-1.4-1.1-2.5-2.5-2.5H28c-2.2 0-4 1.8-4 4v16.5c.9-1.5 2.5-2.4 4.3-2.4h5.2c1.4 0 2.5-1.1 2.5-2.5V16.5Z"
        fill="url(#lumina-mark)"
        opacity="0.55"
      />
      <circle cx="35" cy="13" r="2.6" fill="#42D9F5" />
    </svg>
  )
}

export function Logo({
  to = '/',
  compact = false,
  className,
}: {
  to?: string
  compact?: boolean
  className?: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400',
        className,
      )}
      aria-label="Lumina Library home"
    >
      <LogoMark className="size-9 transition-transform duration-300 group-hover:scale-[1.04]" />
      {!compact && (
        <span className="min-w-0 leading-none">
          <span className="block font-display text-[15px] font-semibold tracking-tight text-fg">
            Lumina<span className="text-brand-400">.</span>
          </span>
          <span className="mt-0.5 block text-[9.5px] font-medium tracking-[0.2em] text-fg-faint uppercase">
            Library
          </span>
        </span>
      )}
    </Link>
  )
}
