import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Currency formatting in Indian rupees — all fines are simulated demo values. */
export function formatINR(value: number, opts: { compact?: boolean } = {}) {
  const safe = Number.isFinite(value) ? value : 0
  if (opts.compact && Math.abs(safe) >= 1000) {
    return `₹${(safe / 1000).toFixed(safe % 1000 === 0 ? 0 : 1)}k`
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: safe % 1 === 0 ? 0 : 2,
  }).format(safe)
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(Number.isFinite(value) ? value : 0)
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(
    Number.isFinite(value) ? value : 0,
  )
}

export function pluralise(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}

export function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Small deterministic hash — used for procedural cover art and avatar colours. */
export function hashString(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

export function makeId(prefix: string, existing: { id: string }[], pad = 3) {
  let max = 0
  for (const record of existing) {
    const match = record.id.match(/(\d+)$/)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `${prefix}-${String(max + 1).padStart(pad, '0')}`
}

export function createId(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36).slice(-4)}${rand}`
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function titleCase(value: string) {
  return value.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, delay = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: Args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function groupBy<T, K extends string | number>(items: T[], key: (item: T) => K) {
  return items.reduce<Record<K, T[]>>(
    (acc, item) => {
      const group = key(item)
      ;(acc[group] ||= []).push(item)
      return acc
    },
    {} as Record<K, T[]>,
  )
}

export function sortBy<T>(items: T[], key: (item: T) => string | number, dir: 'asc' | 'desc' = 'asc') {
  return [...items].sort((a, b) => {
    const av = key(a)
    const bv = key(b)
    if (av === bv) return 0
    const order = av > bv ? 1 : -1
    return dir === 'asc' ? order : -order
  })
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

export function percent(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}
