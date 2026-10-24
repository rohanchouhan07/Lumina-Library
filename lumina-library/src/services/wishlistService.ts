import { callApi } from './apiClient'
import type { ApiWishlistToggle } from '@/types/api'

export async function listWishlist(): Promise<{ bookId: string; createdAt: string }[]> {
  const result = await callApi<{ wishlist: { bookId: string; createdAt: string }[] }>('wishlist.list')
  return result.wishlist
}

export async function toggleWishlist(bookId: string): Promise<ApiWishlistToggle> {
  return callApi<ApiWishlistToggle>('wishlist.toggle', { bookId })
}
