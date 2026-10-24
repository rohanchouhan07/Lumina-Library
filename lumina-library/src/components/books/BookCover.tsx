import { useMemo } from 'react'
import type { Book } from '@/types'
import { cn, hashString } from '@/lib/utils'

/**
 * Procedural cover art: every title gets a deterministic, art-directed cover so the
 * demo has consistent, high-quality artwork without any external image requests.
 */

interface Palette {
  from: string
  to: string
  accent: string
  ink: string
  faint: string
}

const PALETTES: Palette[] = [
  { from: '#16233F', to: '#0B1220', accent: '#5B8CFF', ink: '#EAF0FF', faint: '#8FA8D9' },
  { from: '#2A1B3D', to: '#120E1F', accent: '#A78BFA', ink: '#F2ECFF', faint: '#A796D0' },
  { from: '#0E2A33', to: '#061418', accent: '#42D9F5', ink: '#E6FBFF', faint: '#7FB9C7' },
  { from: '#332214', to: '#170F08', accent: '#F5B222', ink: '#FFF6E3', faint: '#C1A47B' },
  { from: '#1B2E24', to: '#0A1510', accent: '#4ADE9F', ink: '#EBFFF5', faint: '#82B79D' },
  { from: '#331A24', to: '#160A10', accent: '#F56565', ink: '#FFEDED', faint: '#C48F95' },
  { from: '#1D2430', to: '#0B0F16', accent: '#C7D2E4', ink: '#F4F7FC', faint: '#93A1B8' },
  { from: '#20233F', to: '#0C0E1C', accent: '#82A5FF', ink: '#EDF0FF', faint: '#9599C8' },
]

const SERIF_CATEGORIES = new Set(['Literature'])

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxChars && current) {
      lines.push(current)
      current = word
      if (lines.length === maxLines - 1) break
    } else {
      current = candidate
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  const joined = lines.join(' ')
  if (joined.length < text.trim().length && lines.length > 0) {
    const last = lines[lines.length - 1]
    lines[lines.length - 1] = `${last.replace(/[.,;:]$/, '')}…`
  }
  return lines
}

/** Text block geometry inside the 320-wide cover. */
const TEXT_X = 28
const TEXT_MAX_WIDTH = 264
const TITLE_TOP = 118
const TITLE_WEIGHT = 0.56 // average glyph width as a fraction of font size
const MAX_LINES = 4
const MIN_TITLE_SIZE = 17
const MAX_TITLE_SIZE = 40

/**
 * Picks a font size and line breaks so the title always fits the cover width.
 * Long titles shrink gracefully instead of bleeding past the edge.
 */
function fitTitle(title: string): { lines: string[]; fontSize: number; lineHeight: number } {
  for (let size = MAX_TITLE_SIZE; size >= MIN_TITLE_SIZE; size -= 1) {
    const charsPerLine = Math.max(8, Math.floor(TEXT_MAX_WIDTH / (size * TITLE_WEIGHT)))
    const lines = wrapText(title, charsPerLine, MAX_LINES)
    const widest = Math.max(...lines.map((line) => line.length))
    const estimated = widest * size * TITLE_WEIGHT
    const fullyShown = lines.join(' ').replace('…', '').length >= title.trim().length - 1
    if (estimated <= TEXT_MAX_WIDTH && (fullyShown || size <= 24)) {
      return { lines, fontSize: size, lineHeight: size + (size > 30 ? 6 : 4) }
    }
  }
  const charsPerLine = Math.floor(TEXT_MAX_WIDTH / (MIN_TITLE_SIZE * TITLE_WEIGHT))
  return {
    lines: wrapText(title, charsPerLine, MAX_LINES),
    fontSize: MIN_TITLE_SIZE,
    lineHeight: MIN_TITLE_SIZE + 4,
  }
}

export function BookCover({
  book,
  className,
  size = 'md',
  floating = false,
}: {
  book: Pick<Book, 'title' | 'author' | 'category' | 'coverSeed' | 'shelf'>
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  floating?: boolean
}) {
  const palette = PALETTES[Math.abs(book.coverSeed + hashString(book.category)) % PALETTES.length]
  const variant = Math.abs(book.coverSeed) % 6
  const uid = useMemo(() => `cover-${Math.abs(hashString(`${book.title}${book.coverSeed}`))}`.slice(0, 28), [book])

  void size
  const { lines, fontSize: titleFontSize, lineHeight } = fitTitle(book.title)
  const serif = SERIF_CATEGORIES.has(book.category) || book.coverSeed % 7 === 0

  return (
    <div
      className={cn('relative aspect-2/3 w-full select-none', floating && 'animate-float-slow', className)}
      style={{ filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.5))' }}
      role="img"
      aria-label={`Cover of ${book.title} by ${book.author}`}
    >
      <svg viewBox="0 0 320 480" className="size-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor={palette.from} />
            <stop offset="100%" stopColor={palette.to} />
          </linearGradient>
          <linearGradient id={`${uid}-spine`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
            <stop offset="35%" stopColor="#000" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id={`${uid}-gloss`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.14" />
            <stop offset="45%" stopColor="#fff" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${uid}-glow`} cx="0.78" cy="0.18" r="0.7">
            <stop offset="0%" stopColor={palette.accent} stopOpacity="0.4" />
            <stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${uid}-clip`}>
            <rect width="320" height="480" rx="6" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${uid}-clip)`}>
          <rect width="320" height="480" fill={`url(#${uid}-bg)`} />
          <rect width="320" height="480" fill={`url(#${uid}-glow)`} />

          {/* Pattern layer */}
          <g opacity="0.42">
            {variant === 0 && (
              <>
                {[0, 1, 2, 3, 4].map((i) => (
                  <circle
                    key={i}
                    cx="256"
                    cy="128"
                    r={40 + i * 26}
                    fill="none"
                    stroke={palette.accent}
                    strokeOpacity={0.28 - i * 0.045}
                    strokeWidth="1.2"
                  />
                ))}
                <circle cx="256" cy="128" r="9" fill={palette.accent} fillOpacity="0.8" />
              </>
            )}
            {variant === 1 && (
              <>
                {Array.from({ length: 14 }).map((_, i) => (
                  <line
                    key={i}
                    x1={-40 + i * 30}
                    y1="480"
                    x2={60 + i * 30}
                    y2="0"
                    stroke={palette.accent}
                    strokeOpacity={0.16}
                    strokeWidth="1.2"
                  />
                ))}
              </>
            )}
            {variant === 2 && (
              <>
                {Array.from({ length: 5 }).map((_, row) =>
                  Array.from({ length: 5 }).map((_, col) => (
                    <circle
                      key={`${row}-${col}`}
                      cx={40 + col * 26}
                      cy={60 + row * 26}
                      r={3 + ((row + col) % 3)}
                      fill={palette.accent}
                      fillOpacity={0.35 - (row + col) * 0.025}
                    />
                  )),
                )}
              </>
            )}
            {variant === 3 && (
              <>
                <rect x="196" y="44" width="88" height="88" fill="none" stroke={palette.accent} strokeOpacity="0.4" />
                <rect x="212" y="60" width="88" height="88" fill="none" stroke={palette.accent} strokeOpacity="0.22" />
                <rect x="228" y="76" width="88" height="88" fill={palette.accent} fillOpacity="0.08" />
              </>
            )}
            {variant === 4 && (
              <>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <rect
                    key={i}
                    x="30"
                    y={330 + i * 18}
                    width={230 - i * 28}
                    height="6"
                    rx="3"
                    fill={palette.accent}
                    fillOpacity={0.32 - i * 0.04}
                  />
                ))}
              </>
            )}
            {variant === 5 && (
              <>
                <path
                  d="M0 360 C 70 300, 150 420, 320 330"
                  fill="none"
                  stroke={palette.accent}
                  strokeOpacity="0.35"
                  strokeWidth="1.4"
                />
                <path
                  d="M0 396 C 80 330, 160 452, 320 364"
                  fill="none"
                  stroke={palette.accent}
                  strokeOpacity="0.2"
                  strokeWidth="1.2"
                />
                <circle cx="242" cy="336" r="42" fill={palette.accent} fillOpacity="0.09" />
              </>
            )}
          </g>

          {/* Scrim keeps type legible over the pattern layer */}
          <rect x="0" y="80" width="320" height="230" fill={palette.to} fillOpacity="0.35" />
          <rect x="0" y="80" width="320" height="230" fill="url(#${uid}-glow)" opacity="0.4" />

          {/* Type block */}
          <g>
            <text
              x="30"
              y="52"
              fill={palette.faint}
              fontSize="10.5"
              letterSpacing="2.6"
              fontFamily="Inter, system-ui, sans-serif"
              fontWeight="600"
            >
              {book.category.toUpperCase().slice(0, 22)}
            </text>
            <line x1="30" y1="66" x2="78" y2="66" stroke={palette.accent} strokeWidth="2" strokeOpacity="0.85" />

            {lines.map((line, index) => (
              <text
                key={line + index}
                x={TEXT_X}
                y={TITLE_TOP + index * lineHeight}
                fill={palette.ink}
                fontSize={titleFontSize}
                fontFamily={
                  serif ? "'Iowan Old Style', Palatino, Georgia, serif" : 'Inter, system-ui, sans-serif'
                }
                fontWeight={serif ? 600 : 700}
                letterSpacing={serif ? '-0.01em' : '-0.02em'}
              >
                {line}
              </text>
            ))}

            <text
              x="30"
              y="418"
              fill={palette.faint}
              fontSize="12"
              fontFamily="Inter, system-ui, sans-serif"
              letterSpacing="0.6"
            >
              {book.author.length > 30 ? `${book.author.slice(0, 29)}…` : book.author}
            </text>
            <text
              x="30"
              y="446"
              fill={palette.accent}
              fillOpacity="0.7"
              fontSize="8.5"
              letterSpacing="2.2"
              fontFamily="Inter, system-ui, sans-serif"
              fontWeight="600"
            >
              LUMINA LIBRARY
            </text>
          </g>

          <rect width="320" height="480" fill={`url(#${uid}-spine)`} />
          <rect width="320" height="480" fill={`url(#${uid}-gloss)`} />
          <rect x="8" y="0" width="1.5" height="480" fill="#fff" fillOpacity="0.1" />
          <rect
            x="0.5"
            y="0.5"
            width="319"
            height="479"
            rx="6"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.12"
          />
        </g>
      </svg>
    </div>
  )
}
