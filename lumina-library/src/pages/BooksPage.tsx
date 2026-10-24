import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  BookPlus,
  Download,
  Eye,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import type { Book } from '@/types'
import { useLibrary } from '@/providers/LibraryProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useToast } from '@/providers/ToastProvider'
import { useCatalog } from '@/hooks/useCatalog'
import { getAvailability } from '@/features/library/engine'
import { exportBooksCsv } from '@/lib/exportUtils'
import { formatDate } from '@/lib/dateUtils'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SearchInput, Select } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/Tabs'
import { EmptyState } from '@/components/ui/Feedback'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { MenuItem, MenuSeparator, Popover } from '@/components/ui/Menu'
import { BookCard, AvailabilityBadge } from '@/components/books/BookCard'
import { BookFormDialog } from '@/components/books/BookFormDialog'
import { BookDetailDialog } from '@/components/books/BookDetailDialog'
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table'
import { BookCover } from '@/components/books/BookCover'

const PAGE_SIZE = 12

export function BooksPage() {
  const { data } = useLibrary()
  const { can, role } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState<'grid' | 'list'>('list')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Book | null>(null)
  const [detail, setDetail] = useState<Book | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<Book | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Book | null>(null)

  const canManage = can('books.create')
  const canDelete = can('books.delete')

  const { filters, setFilters, results } = useCatalog(data.books, data)

  const categories = useMemo(
    () => Array.from(new Set(data.books.map((book) => book.category))).sort(),
    [data.books],
  )

  // Deep links: ?book=<id>, ?new=1, ?edit=<id>
  useEffect(() => {
    const bookId = searchParams.get('book')
    const editId = searchParams.get('edit')
    if (bookId) {
      const book = data.books.find((item) => item.id === bookId)
      if (book) setDetail(book)
      clearParam('book')
    } else if (editId && can('books.update')) {
      const book = data.books.find((item) => item.id === editId)
      if (book) {
        setEditing(book)
        setFormOpen(true)
      }
      clearParam('edit')
    } else if (searchParams.get('new') && canManage) {
      setEditing(null)
      setFormOpen(true)
      clearParam('new')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function clearParam(key: string) {
    const next = new URLSearchParams(searchParams)
    next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const visible = results.slice(0, visibleCount)
  const hasMore = results.length > visibleCount
  const activeFilterCount =
    (filters.category !== 'all' ? 1 : 0) +
    (filters.availability !== 'all' ? 1 : 0) +
    (filters.sort !== 'relevance' ? 1 : 0)

  const reset = () => {
    setFilters({ query: '', category: 'all', availability: 'all', sort: 'relevance' })
    setVisibleCount(PAGE_SIZE)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={role === 'student' ? 'Catalogue' : 'Inventory'}
        title={role === 'student' ? 'Browse the collection' : 'Book inventory'}
        description={
          role === 'student'
            ? 'Search every title in the library. Borrow or reserve from a title card.'
            : 'Manage copies, availability and archival status. Availability is derived from active loans.'
        }
        actions={
          <>
            {can('reports.export') && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download />}
                onClick={() => exportBooksCsv(results, data, filters.category)}
              >
                Export CSV
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                leftIcon={<BookPlus />}
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                Add book
              </Button>
            )}
          </>
        }
      />

      <div className="surface-card rounded-xl p-3">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <SearchInput
            value={filters.query}
            onChange={(event) => {
              setFilters({ ...filters, query: event.target.value })
              setVisibleCount(PAGE_SIZE)
            }}
            onClear={() => setFilters({ ...filters, query: '' })}
            placeholder="Search title, author, ISBN, shelf or tag…"
            aria-label="Search inventory"
            className="w-full lg:max-w-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filters.category}
              onChange={(event) => setFilters({ ...filters, category: event.target.value })}
              aria-label="Filter by category"
              className="w-auto min-w-36"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
            <Select
              value={filters.availability}
              onChange={(event) =>
                setFilters({ ...filters, availability: event.target.value as typeof filters.availability })
              }
              aria-label="Filter by availability"
              className="w-auto min-w-34"
            >
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="unavailable">All copies out</option>
              <option value="archived">Archived</option>
            </Select>
            <Select
              value={filters.sort}
              onChange={(event) => setFilters({ ...filters, sort: event.target.value as typeof filters.sort })}
              aria-label="Sort books"
              className="w-auto min-w-36"
            >
              <option value="relevance">Sort: Relevant</option>
              <option value="title">Sort: Title</option>
              <option value="author">Sort: Author</option>
              <option value="newest">Sort: Newest</option>
              <option value="availability">Sort: Available</option>
            </Select>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" leftIcon={<RotateCcw />} onClick={reset}>
                Reset
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-[11.5px] text-fg-muted sm:block">{results.length} titles</span>
              <SegmentedControl<'grid' | 'list'>
                aria-label="View mode"
                value={view}
                onChange={setView}
                options={[
                  { value: 'grid', label: '', icon: <LayoutGrid />, title: 'Grid view' },
                  { value: 'list', label: '', icon: <List />, title: 'List view' },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState
          title={filters.query ? `No matches for “${filters.query}”` : 'No books match these filters'}
          description="Adjust your search or clear the filters to see the full inventory."
          action={
            <Button variant="secondary" size="sm" onClick={reset}>
              Clear filters
            </Button>
          }
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onOpen={() => setDetail(book)}
              footer={
                canManage ? (
                  <div className="flex items-center gap-1">
                    <Button size="xs" variant="secondary" className="flex-1" onClick={() => setDetail(book)}>
                      Details
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label={`Edit ${book.title}`}
                      onClick={() => {
                        setEditing(book)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
                ) : undefined
              }
            />
          ))}
        </div>
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Shelf</Th>
                <Th>Category</Th>
                <Th className="text-center">Copies</Th>
                <Th>Availability</Th>
                <Th>Added</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((book) => {
                const availability = getAvailability(book, data)
                return (
                  <Tr key={book.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 shrink-0 overflow-hidden rounded shadow-book">
                          <BookCover book={book} size="xs" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="max-w-[240px] truncate font-medium text-fg">{book.title}</p>
                          </div>
                          <p className="max-w-[260px] truncate text-[11px] text-fg-muted">{book.author}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-[11.5px] whitespace-nowrap">{book.shelf}</Td>
                    <Td>
                      <Badge tone="outline">{book.category}</Badge>
                    </Td>
                    <Td className="text-center text-[12px] tabular-nums">
                      {availability.available}/{availability.total}
                    </Td>
                    <Td>
                      <AvailabilityBadge book={book} />
                    </Td>
                    <Td className="text-[11.5px] whitespace-nowrap text-fg-muted">{formatDate(book.addedAt)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="xs" variant="ghost" onClick={() => setDetail(book)}>
                          <Eye className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">View {book.title}</span>
                        </Button>
                        {canManage && (
                          <Popover
                            label={`Actions for ${book.title}`}
                            trigger={({ toggle, ref, open }) => (
                              <Button
                                ref={ref}
                                size="xs"
                                variant="ghost"
                                aria-expanded={open}
                                onClick={toggle}
                                aria-label={`More actions for ${book.title}`}
                              >
                                <MoreHorizontal className="size-3.5" aria-hidden="true" />
                              </Button>
                            )}
                          >
                            {(close) => (
                              <>
                                <MenuItem
                                  icon={<Pencil />}
                                  onClick={() => {
                                    setEditing(book)
                                    setFormOpen(true)
                                    close()
                                  }}
                                >
                                  Edit record
                                </MenuItem>
                                <MenuItem
                                  icon={book.status === 'archived' ? <ArchiveRestore /> : <Archive />}
                                  onClick={() => {
                                    setConfirmArchive(book)
                                    close()
                                  }}
                                >
                                  {book.status === 'archived' ? 'Restore to catalogue' : 'Archive title'}
                                </MenuItem>
                                {canDelete && (
                                  <>
                                    <MenuSeparator />
                                    <MenuItem
                                      icon={<Trash2 />}
                                      destructive
                                      onClick={() => {
                                        setConfirmDelete(book)
                                        close()
                                      }}
                                    >
                                      Delete record
                                    </MenuItem>
                                  </>
                                )}
                              </>
                            )}
                          </Popover>
                        )}
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
            Load more titles
          </Button>
        </div>
      )}

      {!hasMore && results.length > 0 && (
        <p className="text-center text-[11px] text-fg-faint">
          Showing all {results.length} matching titles
        </p>
      )}

      <BookFormDialog open={formOpen} onOpenChange={setFormOpen} book={editing} />
      <BookDetailDialog
        book={detail}
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
        onEdit={(book) => {
          setDetail(null)
          setEditing(book)
          setFormOpen(true)
        }}
      />

      <ArchiveConfirm
        book={confirmArchive}
        onClose={() => setConfirmArchive(null)}
      />
      <DeleteConfirm book={confirmDelete} onClose={() => setConfirmDelete(null)} />
    </div>
  )
}

function ArchiveConfirm({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const { setBookArchived } = useLibrary()
  const toast = useToast()
  if (!book) return null
  const archiving = book.status !== 'archived'
  return (
    <ConfirmDialog
      open={Boolean(book)}
      onOpenChange={(open) => !open && onClose()}
      title={archiving ? 'Archive this title?' : 'Restore this title?'}
      description={
        archiving
          ? `“${book.title}” will be hidden from the public catalogue. Circulation history is preserved.`
          : `“${book.title}” will return to the active catalogue and become borrowable again.`
      }
      confirmLabel={archiving ? 'Archive title' : 'Restore title'}
      onConfirm={async () => {
        const result = await setBookArchived(book.id, archiving)
        if (!result.ok) toast.error('Action not completed', result.error)
        else toast.success(archiving ? 'Title archived' : 'Title restored', book.title)
        onClose()
      }}
    />
  )
}

function DeleteConfirm({ book, onClose }: { book: Book | null; onClose: () => void }) {
  const { deleteBook } = useLibrary()
  const toast = useToast()
  if (!book) return null
  return (
    <ConfirmDialog
      open={Boolean(book)}
      onOpenChange={(open) => !open && onClose()}
      title="Delete this record permanently?"
      description="Books with circulation history cannot be deleted — archive them instead to keep records consistent."
      confirmLabel="Delete permanently"
      destructive
      onConfirm={async () => {
        const result = await deleteBook(book.id)
        if (!result.ok) toast.error('Book not deleted', result.error)
        else toast.success('Book deleted', `${book.title} was removed from the catalogue.`)
        onClose()
      }}
    >
      <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-ink-950/40 p-2.5">
        <div className="w-8 shrink-0 overflow-hidden rounded">
          <BookCover book={book} size="xs" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-fg">{book.title}</p>
          <p className="truncate text-[11px] text-fg-muted">{book.id}</p>
        </div>
      </div>
    </ConfirmDialog>
  )
}

