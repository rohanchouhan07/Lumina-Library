import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useOutlet } from 'react-router-dom'
import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'

export function PublicLayout() {
  const outlet = useOutlet()
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  return (
    <div className="relative min-h-svh bg-ink-950">
      <a
        href="#public-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-200 focus:rounded-lg focus:bg-ink-750 focus:px-3 focus:py-2 focus:text-[13px] focus:text-fg focus:ring-2 focus:ring-brand-400"
      >
        Skip to main content
      </a>
      <SiteHeader />
      <main id="public-main">{outlet}</main>
      <SiteFooter />
    </div>
  )
}
