import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'

export interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
  duration?: number
  action?: { label: string; onClick: () => void }
}

interface ToastRecord extends ToastInput {
  id: string
  tone: ToastTone
}

interface ToastContextValue {
  toast: (input: ToastInput) => string
  success: (title: string, description?: string, action?: ToastInput['action']) => string
  error: (title: string, description?: string) => string
  info: (title: string, description?: string) => string
  warning: (title: string, description?: string) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toneStyles: Record<ToastTone, { icon: typeof CheckCircle2; ring: string; iconCls: string }> = {
  success: { icon: CheckCircle2, ring: 'border-positive-500/30', iconCls: 'text-positive-400' },
  error: { icon: XCircle, ring: 'border-danger-500/30', iconCls: 'text-danger-400' },
  info: { icon: Info, ring: 'border-brand-500/30', iconCls: 'text-brand-300' },
  warning: { icon: AlertTriangle, ring: 'border-warn-500/30', iconCls: 'text-warn-400' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const timers = useRef(new Map<string, number>())
  const counter = useRef(0)

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      counter.current += 1
      const id = `toast-${counter.current}`
      const record: ToastRecord = { ...input, id, tone: input.tone ?? 'info' }
      setToasts((current) => [...current.slice(-3), record])
      const duration = input.duration ?? (record.tone === 'error' ? 6000 : 4200)
      const timer = window.setTimeout(() => dismiss(id), duration)
      timers.current.set(id, timer)
      return id
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description, action) => toast({ title, description, tone: 'success', action }),
      error: (title, description) => toast({ title, description, tone: 'error' }),
      info: (title, description) => toast({ title, description, tone: 'info' }),
      warning: (title, description) => toast({ title, description, tone: 'warning' }),
    }),
    [toast, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastRecord[]; onDismiss: (id: string) => void }) {
  const reduced = useReducedMotion()
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-200 flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:top-4 sm:right-4 sm:items-end sm:px-0"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => {
          const config = toneStyles[item.tone]
          const Icon = config.icon
          return (
            <motion.div
              key={item.id}
              layout={!reduced}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: 16, scale: 0.98 }}
              transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              role="status"
              className={cn(
                'pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl border bg-ink-850/97 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.95)] backdrop-blur-xl',
                config.ring,
              )}
            >
              <div className="flex items-start gap-2.5 p-3.5">
                <Icon className={cn('mt-px size-4.5 shrink-0', config.iconCls)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-fg">{item.title}</p>
                  {item.description && (
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-fg-muted">{item.description}</p>
                  )}
                  {item.action && (
                    <button
                      type="button"
                      onClick={() => {
                        item.action?.onClick()
                        onDismiss(item.id)
                      }}
                      className="mt-1.5 text-[12px] font-medium text-brand-300 underline-offset-2 hover:underline"
                    >
                      {item.action.label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(item.id)}
                  aria-label="Dismiss notification"
                  className="-mt-1 -mr-1 rounded-md p-1 text-fg-faint transition-colors hover:bg-white/8 hover:text-fg"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
