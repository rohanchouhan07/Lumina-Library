import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  CalendarClock,
  ChartNoAxesColumn,
  CheckCircle2,
  ChevronDown,
  LibraryBig,
  ScanLine,
  RotateCcw,
  Search,
  Sparkles,
  Users,
} from 'lucide-react'
import { IS_API_CONFIGURED } from '@/config/env'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { filterBooks } from '@/hooks/useCatalog'
import { formatDate } from '@/lib/dateUtils'
import { cn, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { AnimatedNumber, Reveal, usePointerParallax } from '@/components/animation/Reveal'
import { BookCover } from '@/components/books/BookCover'
import { BookCard } from '@/components/books/BookCard'
import { SectionHeading } from '@/components/ui/Card'
import { SearchInput } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/Feedback'
import { BookDetailDialog } from '@/components/books/BookDetailDialog'
import type { Book } from '@/types'

const HEADLINE = ['Your', 'Campus', 'Library,']

export function LandingPage() {
  const { data, stats, publicCatalogue, retryPublicCatalogue } = useLibrary()
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const parallax = usePointerParallax(26)
  const [activeBook, setActiveBook] = useState<Book | null>(null)

  /*
   * Signed out in live mode there is no member-scoped data yet, so `stats` is all zeroes.
   * Use the public catalogue's own counters instead, and when the deployment cannot answer
   * `catalogue.public` (2.2.0 and older) say "sign in to see live figures" rather than
   * printing four zeroes as if the library were empty.
   */
  const publicReady = publicCatalogue.status === 'ready'
  const publicNumbers = publicReady
    ? {
        totalCopies: publicCatalogue.stats.copies,
        totalTitles: publicCatalogue.stats.titles,
        availableCopies: publicCatalogue.stats.available,
        activeLoans: publicCatalogue.stats.onLoan,
        members: publicCatalogue.stats.members,
      }
    : null
  const signedOut = IS_API_CONFIGURED && !isAuthenticated
  const shownStats = signedOut && publicNumbers ? publicNumbers : null
  const publicUnavailable = signedOut && publicCatalogue.status === 'unavailable'
  const publicFailed = publicCatalogue.status === 'unavailable' && publicCatalogue.reason === 'failed'
  const publicUnsupported = publicCatalogue.status === 'unavailable' && publicCatalogue.reason === 'unsupported'
  const publicLoading = signedOut && (publicCatalogue.status === 'loading' || publicCatalogue.status === 'idle')
  /** A dash, not a zero: "0" is a claim about the library, "—" is a claim about the request. */
  const statText = (live: number | undefined, fallback: number) => {
    if (shownStats) return formatNumber(live ?? 0)
    if (signedOut) return '—'
    return formatNumber(fallback)
  }

  const heroBooks = useMemo(() => {
    const preferred = ['BK-002', 'BK-021', 'BK-030', 'BK-001', 'BK-024']
    const selected = preferred
      .map((id) => data.books.find((book) => book.id === id))
      .filter((book): book is Book => Boolean(book))
    return selected.length >= 4 ? selected : data.books.slice(0, 5)
  }, [data.books])

  const enterDashboard = () => navigate(isAuthenticated ? '/app' : '/login')

  return (
    <div className="relative">
      {/* ---------------------------------------------------------------- HERO */}
      <section className="noise-overlay relative flex min-h-[100svh] items-center overflow-hidden pt-24 pb-14">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 grid-lines opacity-60 [mask-image:radial-gradient(ellipse_at_50%_20%,black,transparent_78%)]" />
          <div className="absolute -top-40 left-1/2 size-[46rem] -translate-x-1/2 rounded-full bg-brand-600/18 blur-[120px] animate-aurora" />
          <div className="absolute top-1/3 -right-32 size-[30rem] rounded-full bg-violet-600/14 blur-[110px]" />
          <div className="absolute bottom-0 -left-24 size-[26rem] rounded-full bg-cyan-600/10 blur-[100px]" />
        </div>

        <div className="container-page relative grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          <div className="relative z-10 max-w-xl">
            <Reveal y={12}>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11.5px] font-medium text-fg-soft backdrop-blur">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-2 animate-pulse-ring rounded-full bg-positive-400" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-positive-400" />
                </span>
                Library platform for modern campuses
                <span className="text-fg-faint">· {IS_API_CONFIGURED ? 'Live library' : 'Demo'}</span>
              </span>
            </Reveal>

            <h1 className="mt-5 font-display text-[clamp(2.6rem,7vw,4.5rem)] leading-[0.98] font-semibold tracking-[-0.03em]">
              {HEADLINE.map((word, index) => (
                <span key={word}>
                  <motion.span
                    className="inline-block"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 26, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.75, delay: 0.1 + index * 0.09, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {word}
                  </motion.span>{' '}
                </span>
              ))}
              <motion.span
                className="text-gradient inline-block"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 26, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.85, delay: 0.42, ease: [0.22, 1, 0.36, 1] }}
              >
                Reimagined.
              </motion.span>
            </h1>

            <motion.p
              className="mt-5 max-w-md text-[15px] leading-relaxed text-fg-muted sm:text-base"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              Discover books, simplify circulation, and bring your college library into a smarter digital era.
            </motion.p>

            <motion.div
              className="mt-7 flex flex-wrap items-center gap-2.5"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link to="/catalog">
                <Button size="lg" rightIcon={<ArrowRight />}>
                  Explore the Library
                </Button>
              </Link>
              <Button size="lg" variant="secondary" onClick={enterDashboard} rightIcon={<ArrowUpRight />}>
                {IS_API_CONFIGURED ? 'Sign in to the dashboard' : 'Enter Demo Dashboard'}
              </Button>
            </motion.div>

            <motion.div
              className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/8 pt-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.75 }}
            >
              <div className="flex items-center gap-2 text-[12px] text-fg-muted">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-2 animate-pulse-ring rounded-full bg-brand-400" />
                  <span className="relative inline-flex size-2 rounded-full bg-brand-400" />
                </span>
                <span>
                  <strong className="font-semibold text-fg" data-stat="available">
                    {statText(shownStats?.availableCopies, stats.availableCopies)}
                  </strong>{' '}
                  copies available today
                </span>
              </div>
              <div className="hidden h-3 w-px bg-white/10 sm:block" />
              <div className="flex items-center gap-5 text-[12px] text-fg-muted">
                <span>
                  <strong className="font-semibold text-fg" data-stat="titles">
                    {statText(shownStats?.totalTitles, stats.totalTitles)}
                  </strong>{' '}
                  titles
                </span>
                <span>
                  <strong className="font-semibold text-fg" data-stat="members">
                    {statText(shownStats?.members, stats.students)}
                  </strong>{' '}
                  members
                </span>
                <span>
                  <strong className="font-semibold text-fg" data-stat="on-loan">
                    {statText(shownStats?.activeLoans, stats.activeLoans)}
                  </strong>{' '}
                  on loan
                </span>
              </div>
            </motion.div>
          </div>

          <div ref={parallax.ref} className="relative mx-auto w-full max-w-lg lg:max-w-none">
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 size-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/18 blur-[90px]"
            />
            <div className="relative h-[420px] sm:h-[500px]">
              {[
                { book: heroBooks[0], className: 'left-[2%] top-[14%] w-[38%] -rotate-[9deg] z-20', depth: 1.6, delay: 0 },
                { book: heroBooks[1], className: 'left-[30%] top-[2%] w-[40%] rotate-[3deg] z-30', depth: 2.6, delay: 0.6 },
                { book: heroBooks[2], className: 'right-[0%] top-[20%] w-[36%] rotate-[11deg] z-20', depth: 2, delay: 1.1 },
                { book: heroBooks[3], className: 'left-[14%] bottom-[2%] w-[32%] rotate-[7deg] z-10', depth: 1.1, delay: 0.3 },
                { book: heroBooks[4], className: 'right-[4%] bottom-[4%] w-[30%] -rotate-[7deg] z-10', depth: 1.4, delay: 0.9 },
              ].map((layer, index) =>
                layer.book ? (
                  <motion.div
                    key={`${layer.book.id}-${index}`}
                    className={cn('absolute', layer.className)}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 40, rotate: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.9, delay: 0.35 + index * 0.12, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      transform: `translate3d(${parallax.offset.x * layer.depth}px, ${parallax.offset.y * layer.depth}px, 0)`,
                    }}
                  >
                    <div
                      className="animate-float-slow transition-transform duration-500 hover:-translate-y-2 hover:rotate-1"
                      style={{ animationDelay: `${layer.delay}s` }}
                    >
                      <BookCover book={layer.book} />
                    </div>
                  </motion.div>
                ) : null,
              )}

              <motion.div
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.1, duration: 0.6 }}
                style={{
                  transform: `translate3d(${parallax.offset.x * 3.4}px, ${parallax.offset.y * 3.4}px, 0)`,
                }}
                className="absolute top-[46%] left-[-4%] z-40 hidden rounded-xl border border-white/12 bg-ink-850/92 px-3 py-2 shadow-lift backdrop-blur-md sm:block"
              >
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-md bg-positive-500/15 text-positive-400">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[11px] font-medium text-fg">Issued successfully</p>
                    <p className="text-[9.5px] text-fg-faint">Due in 14 days</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.3, duration: 0.6 }}
                style={{
                  transform: `translate3d(${parallax.offset.x * 2.2}px, ${parallax.offset.y * 2.2}px, 0)`,
                }}
                className="absolute right-[-2%] bottom-[26%] z-40 hidden rounded-xl border border-white/12 bg-ink-850/92 px-3 py-2 shadow-lift backdrop-blur-md sm:block"
              >
                <p className="text-[9.5px] tracking-wide text-fg-faint uppercase">Reservation queue</p>
                <p className="text-[11.5px] font-medium text-fg">Position #1 · ready</p>
              </motion.div>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-5 flex justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="flex flex-col items-center gap-1.5 text-[10.5px] tracking-[0.18em] text-fg-faint uppercase"
          >
            Scroll
            <span className="relative h-7 w-4 overflow-hidden rounded-full border border-white/15">
              <span className="absolute top-0 left-1/2 h-2 w-1 -translate-x-1/2 animate-scroll-hint rounded-full bg-brand-300" />
            </span>
          </motion.div>
        </div>
      </section>

      {/* -------------------------------------------------------------- STATS */}
      <section className="relative border-y border-white/6 bg-ink-900/40">
        <div className="container-page py-10">
          <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-[13px] font-medium tracking-[0.14em] text-fg-faint uppercase">
              Library at a glance
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[11.5px] text-fg-faint" data-testid="stats-source">
                {shownStats
                  ? 'Live figures from the library spreadsheet · counts, never member details'
                  : publicFailed
                    ? 'Could not reach the library server · the figures below are not available right now'
                    : publicUnsupported
                      ? 'Sign in to see live figures · this deployment predates the public catalogue'
                      : publicLoading
                        ? 'Reading the live catalogue… the first request after a quiet spell takes a few seconds'
                        : 'Derived from the seeded demo dataset · sample figures, not institutional statistics'}
              </p>
              {publicFailed && (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={retryPublicCatalogue}
                  leftIcon={<RotateCcw />}
                  data-testid="stats-retry"
                >
                  Retry
                </Button>
              )}
            </div>
          </Reveal>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-4">
            {[
              ...(shownStats
                ? [
                    { label: 'Total book copies', value: shownStats.totalCopies, hint: `${shownStats.totalTitles} unique titles` },
                    { label: 'Registered members', value: shownStats.members, hint: 'Accounts on the sheet' },
                    { label: 'Books issued now', value: shownStats.activeLoans, hint: 'Copies currently out' },
                    { label: 'Available today', value: shownStats.availableCopies, hint: 'Ready to borrow' },
                  ]
                : publicUnavailable || publicLoading
                  ? [
                      {
                        label: 'Total book copies',
                        value: null,
                        hint: publicLoading ? 'Loading…' : publicFailed ? 'Could not load' : 'Sign in to load',
                      },
                      {
                        label: 'Registered members',
                        value: null,
                        hint: publicLoading ? 'Loading…' : publicFailed ? 'Could not load' : 'Sign in to load',
                      },
                      {
                        label: 'Books issued now',
                        value: null,
                        hint: publicLoading ? 'Loading…' : publicFailed ? 'Could not load' : 'Sign in to load',
                      },
                      {
                        label: 'Available today',
                        value: null,
                        hint: publicLoading ? 'Loading…' : publicFailed ? 'Could not load' : 'Sign in to load',
                      },
                    ]
                  : [
                      { label: 'Total book copies', value: stats.totalCopies, hint: `${stats.totalTitles} unique titles` },
                      { label: 'Registered members', value: stats.totalMembers, hint: `${stats.activeMembers} active` },
                      { label: 'Books issued now', value: stats.activeLoans, hint: `${stats.utilisation}% of copies` },
                      { label: 'Available today', value: stats.availableCopies, hint: 'Ready to borrow' },
                    ]),
            ].map((item, index) => (
              <Reveal key={item.label} delay={index * 0.07}>
                <div data-stat-tile={item.label}>
                  <dd className="font-display text-[clamp(1.9rem,4vw,2.75rem)] leading-none font-semibold tracking-tight text-fg">
                    {item.value === null ? (
                      <span className="text-fg-faint">—</span>
                    ) : (
                      <AnimatedNumber value={item.value} />
                    )}
                  </dd>
                  <dt className="mt-1.5 text-[12.5px] font-medium text-fg-soft">{item.label}</dt>
                  <p className="mt-0.5 text-[11px] text-fg-faint">{item.hint}</p>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* ----------------------------------------------------------- FEATURES */}
      <FeaturesSection />

      {/* ---------------------------------------------------------- DISCOVERY */}
      <DiscoverySection books={data.books} onOpen={setActiveBook} />

      {/* --------------------------------------------------------- HOW IT WORKS */}
      <HowItWorks />

      {/* ------------------------------------------------------------ FINAL CTA */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/2 left-1/2 size-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/16 blur-[110px]" />
        </div>
        <div className="container-page relative">
          <Reveal className="mx-auto max-w-3xl">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-ink-850 to-ink-900 p-8 text-center sm:p-12">
              <div
                aria-hidden="true"
                className="absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(ellipse_at_center,rgba(91,140,255,0.28),transparent_70%)]"
              />
              <Badge tone="brand" className="relative">
                <Sparkles className="size-3" aria-hidden="true" /> Ready to explore
              </Badge>
              <h2 className="relative mt-4 font-display text-[clamp(1.9rem,4.5vw,3rem)] leading-[1.05] font-semibold tracking-tight">
                Step into a library that keeps up with your campus.
              </h2>
              <p className="relative mx-auto mt-3 max-w-lg text-[14px] leading-relaxed text-fg-muted">
                {IS_API_CONFIGURED
                  ? 'Sign in with your library credentials and pick up the real workflow — catalogue, circulation, holds and analytics, backed by the library spreadsheet.'
                  : 'Choose a demo role and explore the full workflow — catalogue management, circulation, holds and analytics, all running locally in your browser.'}
              </p>
              <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2.5">
                <Button size="lg" onClick={enterDashboard} rightIcon={<ArrowRight />}>
                  {isAuthenticated ? 'Open dashboard' : 'Enter the Library'}
                </Button>
                <Link to="/catalog">
                  <Button size="lg" variant="outline" leftIcon={<LibraryBig />}>
                    Browse catalogue
                  </Button>
                </Link>
              </div>
              <p className="relative mt-4 text-[11px] text-fg-faint">
                {IS_API_CONFIGURED
                  ? 'Accounts are issued by a library administrator. There is no public sign-up.'
                  : 'No sign-up, no password, no server. Your demo data stays on this device.'}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <BookDetailDialog book={activeBook} open={Boolean(activeBook)} onOpenChange={(open) => !open && setActiveBook(null)} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Features                                                                    */
/* -------------------------------------------------------------------------- */

const FEATURES = [
  {
    key: 'catalog',
    icon: LibraryBig,
    title: 'Smart book catalog',
    tagline: 'Search the catalogue by author, ISBN, category or shelf.',
    points: ['Grid and list views', 'Live availability counts', 'Category and status filters'],
  },
  {
    key: 'circulation',
    icon: ScanLine,
    title: 'Issue & return management',
    tagline: 'A desk workflow that validates eligibility before anything changes.',
    points: ['Borrow limits enforced', 'Fines calculated automatically', 'Every action logged'],
  },
  {
    key: 'selfservice',
    icon: BookOpen,
    title: 'Student self-service',
    tagline: 'Students see only their own loans, holds and due dates.',
    points: ['Personal dashboard', 'Renew eligible loans', 'Wishlist saves'],
  },
  {
    key: 'reservations',
    icon: Bookmark,
    title: 'Reservations & due dates',
    tagline: 'Automatic holds when every copy is out, with a clear queue.',
    points: ['Queue positions', 'Hold expiry windows', 'Duplicate prevention'],
  },
  {
    key: 'analytics',
    icon: ChartNoAxesColumn,
    title: 'Library analytics',
    tagline: 'Circulation, category mix and overdue trends from the library records.',
    points: ['Monthly issue trends', 'Most borrowed titles', 'CSV exports'],
  },
  {
    key: 'members',
    icon: Users,
    title: 'Member management',
    tagline: 'Register students and staff, track limits, fines and history.',
    points: ['Role-aware access', 'Membership status', 'Borrowing history'],
  },
] as const

function FeaturesSection() {
  const [active, setActive] = useState(0)
  const { data, publicCatalogue } = useLibrary()
  const feature = FEATURES[active]
  /*
   * The catalogue illustration used to hardcode "41 titles" — a number from the offline seed
   * dataset that contradicted the live sheet. It now mirrors the books actually loaded, and
   * says so, or falls back to a neutral label while the request is in flight.
   */
  const sampleBooks = data.books.filter((book) => book.status === 'active').slice(0, 3)
  const catalogueCount = publicCatalogue.status === 'ready' ? publicCatalogue.stats.titles : null

  return (
    <section id="features" className="relative py-16 sm:py-24">
      <div className="container-page">
        <Reveal>
          <SectionHeading
            eyebrow="Platform"
            title="Six workflows that carry the whole library."
            description="From the first search to the final report, every step is connected to the same dataset — no duplicated spreadsheets, no stale numbers."
            className="max-w-3xl"
          />
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.05fr] lg:gap-10">
          <div className="space-y-1.5">
            {FEATURES.map((item, index) => {
              const isActive = index === active
              return (
                <Reveal key={item.key} delay={index * 0.04}>
                  <button
                    type="button"
                    onClick={() => setActive(index)}
                    aria-pressed={isActive}
                    className={cn(
                      'group relative flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-300',
                      isActive
                        ? 'border-white/14 bg-white/[0.05] shadow-lift'
                        : 'border-white/6 bg-white/[0.015] hover:border-white/10 hover:bg-white/[0.03]',
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="feature-glow"
                        className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-brand-500/10 to-transparent"
                        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                      />
                    )}
                    <span
                      className={cn(
                        'relative grid size-9 shrink-0 place-items-center rounded-lg border transition-colors',
                        isActive
                          ? 'border-brand-500/30 bg-brand-500/12 text-brand-300'
                          : 'border-white/8 bg-white/[0.03] text-fg-muted group-hover:text-fg-soft',
                      )}
                    >
                      <item.icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="relative min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn('text-[13.5px] font-semibold', isActive ? 'text-fg' : 'text-fg-soft')}>
                          {item.title}
                        </span>
                        <ArrowRight
                          className={cn(
                            'size-3.5 transition-all',
                            isActive ? 'text-brand-300 opacity-100' : '-translate-x-1 opacity-0',
                          )}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-muted">{item.tagline}</span>
                    </span>
                  </button>
                </Reveal>
              )
            })}
          </div>

          <Reveal delay={0.1} className="lg:sticky lg:top-24 lg:self-start">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-ink-850/90 to-ink-900/90 p-5 sm:p-6">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-brand-500/12 blur-3xl"
              />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg border border-brand-500/25 bg-brand-500/12 text-brand-300">
                    <feature.icon className="size-4" aria-hidden="true" />
                  </span>
                  <p className="text-[13px] font-semibold text-fg">{feature.title}</p>
                </div>
                <span className="text-[10.5px] tracking-[0.16em] text-fg-faint uppercase">
                  0{active + 1}/0{FEATURES.length}
                </span>
              </div>

              <motion.div
                key={feature.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="relative mt-4"
              >
                <div className="rounded-xl border border-white/8 bg-ink-950/50 p-4">
                  <FeatureVisual variant={feature.key} books={sampleBooks} catalogueCount={catalogueCount} />
                </div>
                <ul className="mt-4 grid gap-1.5 sm:grid-cols-3">
                  {feature.points.map((point) => (
                    <li key={point} className="flex items-start gap-1.5 text-[11.5px] text-fg-muted">
                      <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-positive-400" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function FeatureVisual({
  variant,
  books,
  catalogueCount,
}: {
  variant: string
  books: Book[]
  catalogueCount: number | null
}) {
  const reduced = useReducedMotion()
  const rows = [0, 1, 2]
  return (
    <div className="space-y-2">
      {variant === 'catalog' && (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-ink-900/80 px-2.5 py-1.5">
            <Search className="size-3 text-fg-faint" />
            <span className="text-[10.5px] text-fg-faint">title, author, ISBN…</span>
            <span
              className="ml-auto rounded bg-white/6 px-1.5 py-0.5 text-[9px] text-fg-muted"
              data-testid="feature-catalogue-count"
            >
              {catalogueCount !== null ? `${catalogueCount} titles` : 'catalogue'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {rows.map((index) => {
              const book = books[index]
              return (
                <div key={index} className="space-y-1.5 rounded-lg border border-white/6 bg-ink-900/60 p-2">
                  {book ? (
                    <>
                      <div className="relative aspect-2/3 overflow-hidden rounded bg-gradient-to-br from-brand-500/25 to-violet-500/15">
                        <BookCover book={book} />
                      </div>
                      <p className="line-clamp-2 text-[9px] leading-tight font-medium text-fg-soft">{book.title}</p>
                      <p className="line-clamp-1 text-[8.5px] text-fg-faint">{book.author}</p>
                    </>
                  ) : (
                    <>
                      <div className="aspect-2/3 rounded bg-gradient-to-br from-brand-500/25 to-violet-500/15" />
                      <div className="h-1.5 w-4/5 rounded bg-white/12" />
                      <div className="h-1.5 w-1/2 rounded bg-white/6" />
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
      {variant === 'circulation' && (
        <div className="space-y-2" aria-hidden="true">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-2 rounded-lg border border-white/6 bg-ink-900/70 px-2.5 py-2">
              <span className="grid size-6 place-items-center rounded bg-brand-500/12 text-brand-300">
                <ScanLine className="size-3" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="h-1.5 w-24 rounded bg-white/14" />
                <div className="mt-1 h-1.5 w-16 rounded bg-white/6" />
              </div>
              <motion.span
                className="rounded bg-positive-500/12 px-1.5 py-0.5 text-[9px] text-positive-400"
                animate={reduced ? undefined : { opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, delay: row * 0.4 }}
              >
                {row === 1 ? 'return' : 'issued'}
              </motion.span>
            </div>
          ))}
        </div>
      )}
      {variant === 'selfservice' && (
        <div className="mx-auto max-w-[220px] rounded-xl border border-white/10 bg-ink-900/80 p-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded bg-white/10" />
          <p className="text-[9px] tracking-[0.14em] text-fg-faint uppercase">My loans</p>
          {[0, 1].map((i) => (
            <div key={i} className="mt-1.5 rounded-lg border border-white/6 bg-ink-950/60 p-2">
              <div className="h-1.5 w-3/4 rounded bg-white/14" />
              <div className="mt-1 flex items-center justify-between">
                <div className="h-1.5 w-12 rounded bg-white/6" />
                <span className={cn('text-[8.5px]', i === 0 ? 'text-warn-400' : 'text-fg-muted')}>
                  {i === 0 ? 'Due in 2d' : 'Due in 9d'}
                </span>
              </div>
            </div>
          ))}
          <div className="mt-2 rounded-lg border border-brand-500/25 bg-brand-500/10 py-1 text-center text-[9px] text-brand-200">
            Renew loan
          </div>
        </div>
      )}
      {variant === 'reservations' && (
        <div className="space-y-1.5">
          {['Ready for pickup', 'Queue position 2', 'Queue position 3'].map((label, i) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border border-white/6 bg-ink-900/70 px-2.5 py-1.5">
              <span className={cn('size-1.5 rounded-full', i === 0 ? 'bg-positive-400' : 'bg-fg-faint')} />
              <span className="text-[10px] text-fg-soft">{label}</span>
              <span className="ml-auto text-[9px] text-fg-faint">
                {i === 0 ? 'collect by Fri' : `#${i + 1}`}
              </span>
            </div>
          ))}
        </div>
      )}
      {variant === 'analytics' && (
        <div className="flex h-24 items-end gap-2 px-2">
          {[38, 62, 45, 78, 56, 88, 70].map((height, index) => (
            <motion.div
              key={index}
              className="flex-1 rounded-t bg-gradient-to-t from-brand-600/50 to-brand-400"
              initial={reduced ? { height: `${height}%` } : { height: 0 }}
              whileInView={{ height: `${height}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
        </div>
      )}
      {variant === 'members' && (
        <div className="space-y-1.5">
          {[
            ['Riya Sharma', 'CSE · 3 on loan'],
            ['Aditya Verma', 'IT · 1 on loan'],
            ['Sneha Iyer', 'ECE · 0 on loan'],
          ].map(([name, meta], i) => (
            <div key={name} className="flex items-center gap-2 rounded-lg border border-white/6 bg-ink-900/70 px-2.5 py-1.5">
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full text-[8px] font-bold text-white/90',
                  i === 0 ? 'bg-brand-500/70' : i === 1 ? 'bg-violet-500/70' : 'bg-cyan-500/60',
                )}
              >
                {name.split(' ').map((n) => n[0]).join('')}
              </span>
              <span className="text-[10px] text-fg-soft">{name}</span>
              <span className="ml-auto text-[9px] text-fg-faint">{meta}</span>
              <span className="size-1.5 rounded-full bg-positive-400" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Discovery                                                                   */
/* -------------------------------------------------------------------------- */

function DiscoverySection({ books, onOpen }: { books: Book[]; onOpen: (book: Book) => void }) {
  const { data, publicCatalogue } = useLibrary()
  const { isAuthenticated } = useAuth()
  const catalogueUnavailable =
    IS_API_CONFIGURED && !isAuthenticated && publicCatalogue.status === 'unavailable'
  const [query, setQuery] = useState('')
  const results = useMemo(
    () => filterBooks(books, data, { query, category: 'all', availability: 'all', sort: 'relevance' }),
    [books, data, query],
  )
  const visible = results.slice(0, 8)
  const soonDue = data.loans
    .filter((loan) => loan.status === 'active')
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0]

  return (
    <section id="discover" className="relative border-y border-white/6 bg-ink-900/30 py-16 sm:py-24">
      <div className="container-page">
        <Reveal>
          <SectionHeading
            eyebrow="Explore books"
            title="A catalogue that feels worth browsing."
            description={
              IS_API_CONFIGURED
                ? 'Search the library\'s live catalogue right here — titles, authors and how many copies are free today. Every cover is generated in-app, so nothing depends on an external image service.'
                : 'Search the seeded collection right here. Every cover is generated in-app, so nothing depends on an external image service.'
            }
            actions={
              <Link to="/catalog">
                <Button variant="secondary" rightIcon={<ArrowRight />}>
                  View full catalog
                </Button>
              </Link>
            }
          />
        </Reveal>

        <Reveal delay={0.05} className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery('')}
              placeholder="Try “algorithms”, “Ruskin”, “physics” or an ISBN…"
              aria-label="Search the catalogue"
              className="w-full sm:max-w-md"
            />
            <div className="flex items-center gap-2 text-[11.5px] text-fg-muted">
              <Badge tone="outline">{results.length} matching titles</Badge>
              {soonDue && (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3.5" aria-hidden="true" />
                  Next return {formatDate(soonDue.dueAt)}
                </span>
              )}
            </div>
          </div>
        </Reveal>

        {visible.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={<Search />}
              title={catalogueUnavailable ? 'The live catalogue needs a sign-in' : 'No titles match that search'}
              description={
                catalogueUnavailable
                  ? 'This deployment cannot read the catalogue without a session yet. Sign in with your library account to browse every title.'
                  : 'Try a different author, category or ISBN, or clear the search to see everything.'
              }
              action={
                catalogueUnavailable ? (
                  <Link to="/login">
                    <Button size="sm" variant="secondary">
                      Sign in
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((book, index) => (
              <Reveal key={book.id} delay={Math.min(index * 0.04, 0.25)}>
                <BookCard book={book} onOpen={() => onOpen(book)} compact />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* How it works                                                                */
/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    title: 'Discover a book',
    description: 'Search the catalogue by title, author, ISBN or category and check live availability.',
    icon: Search,
  },
  {
    title: 'Sign in with a role',
    description: 'Sign in as administrator, faculty or student — each role sees a different workspace.',
    icon: Users,
  },
  {
    title: 'Borrow or reserve',
    description: 'Take an available copy, or join the queue when every copy is already out.',
    icon: Bookmark,
  },
  {
    title: 'Track and return',
    description: 'Follow due dates, renew eligible loans, and settle simulated fines at the desk.',
    icon: CalendarClock,
  },
]

function HowItWorks() {
  const reduced = useReducedMotion()
  return (
    <section id="how-it-works" className="relative py-16 sm:py-24">
      <div className="container-page">
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title="Four steps from shelf to dashboard."
            description="The demo mirrors a real circulation workflow, including the guardrails that stop impossible records."
            className="max-w-2xl"
          />
        </Reveal>

        <div className="relative mt-10">
          <div
            aria-hidden="true"
            className="absolute top-8 right-0 left-0 hidden h-px bg-gradient-to-r from-transparent via-brand-500/35 to-transparent lg:block"
          />
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <Reveal as="li" key={step.title} delay={index * 0.08}>
                <div className="relative h-full rounded-xl border border-white/8 bg-ink-870/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-lg border border-brand-500/25 bg-brand-500/10 text-brand-300">
                      <step.icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="font-display text-[26px] leading-none font-semibold text-white/8">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[13.5px] font-semibold text-fg">{step.title}</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{step.description}</p>
                  {index < STEPS.length - 1 && (
                    <motion.span
                      aria-hidden="true"
                      className="absolute top-1/2 -right-2 hidden size-4 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-ink-900 text-fg-faint lg:grid"
                      animate={reduced ? undefined : { x: [0, 3, 0] }}
                      transition={{ duration: 2.4, repeat: Infinity, delay: index * 0.3 }}
                    >
                      <ArrowRight className="size-2.5" />
                    </motion.span>
                  )}
                </div>
              </Reveal>
            ))}
          </ol>
        </div>

        <Reveal delay={0.1} className="mt-8">
          <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.02] p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-7 place-items-center rounded-md border border-warn-500/25 bg-warn-500/10 text-warn-400">
                <Sparkles className="size-3.5" aria-hidden="true" />
              </span>
              <p className="max-w-xl text-[12px] leading-relaxed text-fg-muted">
                {IS_API_CONFIGURED
                  ? 'Records come from the library spreadsheet through the Apps Script API. Fines are simulated at ₹5 per overdue day and are never charged.'
                  : 'Everything runs on local demo data. Fines are simulated at ₹5 per overdue day and are not real charges. Sign in with any demo role to explore all three experiences.'}
              </p>
            </div>
            <Link to="/login">
              <Button size="sm" variant="secondary" rightIcon={<ChevronDown className="rotate-[-90deg]" />}>
                {IS_API_CONFIGURED ? 'Sign in' : 'Choose a role'}
              </Button>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
