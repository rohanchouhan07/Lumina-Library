import { useEffect, useMemo, useState } from 'react'
import type { Book, LibraryData } from '@/types'
import { getAvailability } from '@/features/library/engine'

export type AvailabilityFilter = 'all' | 'available' | 'unavailable' | 'archived'
export type CatalogSort = 'relevance' | 'title' | 'author' | 'newest' | 'availability'

export interface CatalogFilters {
  query: string
  category: string
  availability: AvailabilityFilter
  sort: CatalogSort
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
  query: '',
  category: 'all',
  availability: 'all',
  sort: 'relevance',
}

export function useDebouncedValue<T>(value: T, delay = 220): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function filterBooks(books: Book[], data: LibraryData, filters: CatalogFilters): Book[] {
  const term = filters.query.trim().toLowerCase()
  const result = books.filter((book) => {
    if (filters.availability === 'archived' && book.status !== 'archived') return false
    if (filters.availability !== 'archived' && book.status === 'archived' && filters.availability !== 'all')
      return false
    if (filters.availability === 'available' && getAvailability(book, data).available === 0) return false
    if (filters.availability === 'unavailable' && getAvailability(book, data).available > 0) return false
    if (filters.category !== 'all' && book.category !== filters.category) return false
    if (!term) return true
    return (
      book.title.toLowerCase().includes(term) ||
      book.author.toLowerCase().includes(term) ||
      book.isbn.toLowerCase().includes(term) ||
      book.category.toLowerCase().includes(term) ||
      book.tags.some((tag) => tag.toLowerCase().includes(term))
    )
  })

  const sorted = [...result]
  switch (filters.sort) {
    case 'title':
      sorted.sort((a, b) => a.title.localeCompare(b.title))
      break
    case 'author':
      sorted.sort((a, b) => a.author.localeCompare(b.author))
      break
    case 'newest':
      sorted.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
      break
    case 'availability':
      sorted.sort(
        (a, b) => getAvailability(b, data).available - getAvailability(a, data).available,
      )
      break
    default:
      sorted.sort((a, b) => {
        const aAvail = getAvailability(a, data).available
        const bAvail = getAvailability(b, data).available
        if (aAvail === 0 && bAvail > 0) return 1
        if (bAvail === 0 && aAvail > 0) return -1
        return a.title.localeCompare(b.title)
      })
  }
  return sorted
}

export function useCatalog(books: Book[], data: LibraryData, initial?: Partial<CatalogFilters>) {
  const [filters, setFilters] = useState<CatalogFilters>({ ...DEFAULT_CATALOG_FILTERS, ...initial })
  const debouncedQuery = useDebouncedValue(filters.query)
  const effective = useMemo(() => ({ ...filters, query: debouncedQuery }), [filters, debouncedQuery])
  const results = useMemo(() => filterBooks(books, data, effective), [books, data, effective])
  return { filters, setFilters, results, isFiltering: filters.query !== debouncedQuery }
}
