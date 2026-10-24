import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import { ToastProvider } from '@/providers/ToastProvider'
import { LibraryProvider, useLibrary } from '@/providers/LibraryProvider'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { DEFAULT_PREFERENCES } from '@/data/seedData'

const ACCENTS: Record<string, { '400': string; '500': string; '600': string }> = {
  blue: { '400': '#82A5FF', '500': '#5B8CFF', '600': '#4272E6' },
  violet: { '400': '#BDA7FB', '500': '#A78BFA', '600': '#8A68EE' },
  cyan: { '400': '#6CE4F8', '500': '#42D9F5', '600': '#1FB9D6' },
}

/**
 * Applies the signed-in member's preferences to the document root.
 * Guests always get the default look so the public site stays consistent.
 */
function ThemeController({ children }: { children: ReactNode }) {
  const { preferences, member } = useAuth()
  const active = member ? preferences : DEFAULT_PREFERENCES

  useEffect(() => {
    const root = document.documentElement
    root.dataset.motion = active.motion === 'reduced' ? 'reduced' : 'full'
    root.dataset.density = active.density
    const accent = ACCENTS[active.accent] ?? ACCENTS.blue
    root.style.setProperty('--color-brand-400', accent['400'])
    root.style.setProperty('--color-brand-500', accent['500'])
    root.style.setProperty('--color-brand-600', accent['600'])
  }, [active])

  return (
    <MotionConfig reducedMotion={active.motion === 'reduced' ? 'always' : 'user'}>
      {children}
    </MotionConfig>
  )
}

/** Surfaces storage health globally without blocking the UI. */
function StorageWatchdog() {
  const { recovered, storageOk } = useLibrary()
  useEffect(() => {
    if (!storageOk) {
      console.info('[Lumina] localStorage is blocked — using the in-memory store for this session.')
    }
    if (recovered) {
      console.warn('[Lumina] Stored demo data was unreadable and has been reseeded.')
    }
  }, [storageOk, recovered])
  return null
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <LibraryProvider>
        <AuthProvider>
          <ThemeController>
            <StorageWatchdog />
            {children}
          </ThemeController>
        </AuthProvider>
      </LibraryProvider>
    </ToastProvider>
  )
}
