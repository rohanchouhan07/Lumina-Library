import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, LayoutDashboard, Menu, X } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/layout/Logo'

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#discover', label: 'Explore Books' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#about', label: 'About' },
]

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const reduced = useReducedMotion()
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const onLanding = location.pathname === '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  const goToSection = (href: string) => {
    setOpen(false)
    if (!onLanding) {
      navigate(`/${href}`)
      return
    }
    const element = document.querySelector(href)
    element?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-80 transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled
          ? 'border-b border-white/8 bg-ink-950/80 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Site">
          {LINKS.map((link) => (
            <button
              key={link.href}
              type="button"
              onClick={() => goToSection(link.href)}
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-white/[0.05] hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <Link to="/app">
              <Button size="sm" leftIcon={<LayoutDashboard />}>
                Open dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link to="/login">
                <Button size="sm" rightIcon={<ArrowRight />}>
                  Get started
                </Button>
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-fg-soft transition-colors hover:bg-white/[0.06] md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/8 bg-ink-950/95 backdrop-blur-xl md:hidden"
          >
            <div className="container-page space-y-1 py-3">
              {LINKS.map((link) => (
                <button
                  key={link.href}
                  type="button"
                  onClick={() => goToSection(link.href)}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-[14px] text-fg-soft hover:bg-white/[0.05]"
                >
                  {link.label}
                </button>
              ))}
              <div className="flex gap-2 pt-2">
                <Link to={isAuthenticated ? '/app' : '/login'} className="flex-1">
                  <Button fullWidth leftIcon={<LayoutDashboard />}>
                    {isAuthenticated ? 'Dashboard' : 'Enter demo'}
                  </Button>
                </Link>
                <Link to="/catalog" className="flex-1">
                  <Button fullWidth variant="secondary">
                    Catalogue
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
