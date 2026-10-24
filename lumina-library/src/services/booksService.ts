import { callApi } from './apiClient'
import type { ApiBook } from '@/types/api'

export interface BookPayload {
  title: string
  author: string
  isbn: string
  publisher: string
  year: number | string
  category: string
  shelf: string
  totalCopies: number
  description?: string
  coverImageUrl?: string
}

export async function listBooks(): Promise<ApiBook[]> {
  const result = await callApi<{ books: ApiBook[] }>('books.list')
  return result.books
}

export async function getBook(bookId: string): Promise<ApiBook> {
  const result = await callApi<{ book: ApiBook }>('books.get', { bookId })
  return result.book
}

export async function createBook(payload: BookPayload): Promise<ApiBook> {
  const result = await callApi<{ book: ApiBook }>('books.create', { ...payload })
  return result.book
}

export async function updateBook(bookId: string, payload: BookPayload): Promise<ApiBook> {
  const result = await callApi<{ book: ApiBook }>('books.update', { bookId, ...payload })
  return result.book
}

export async function setBookArchived(bookId: string, archived: boolean): Promise<ApiBook> {
  const result = await callApi<{ book: ApiBook }>('books.archive', { bookId, archived })
  return result.book
}

/** Permanently removes a title. The backend refuses when circulation history exists. */
export async function deleteBook(bookId: string): Promise<{ deleted: boolean; bookId: string }> {
  return callApi<{ deleted: boolean; bookId: string }>('books.delete', { bookId })
}
