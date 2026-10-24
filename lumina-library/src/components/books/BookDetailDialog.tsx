import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Pencil } from 'lucide-react'
import type { Book } from '@/types'
import { useAuth } from '@/providers/AuthProvider'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { BookCirculationActions, BookDetailPanel } from './BookDetailPanel'

export function BookDetailDialog({
  book,
  open,
  onOpenChange,
  onEdit,
}: {
  book: Book | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (book: Book) => void
}) {
  const { can, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  if (!book) return null

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Title details"
      description={`${book.id} · ${book.category}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="secondary"
            rightIcon={<ArrowUpRight />}
            onClick={() => {
              onOpenChange(false)
              navigate(`/books/${book.id}`)
            }}
          >
            Public page
          </Button>
          {onEdit && can('books.update') && (
            <Button leftIcon={<Pencil />} onClick={() => onEdit(book)}>
              Edit record
            </Button>
          )}
        </>
      }
    >
      <BookDetailPanel
        book={book}
        actions={isAuthenticated ? <BookCirculationActions book={book} /> : undefined}
      />
    </Dialog>
  )
}
