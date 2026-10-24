import { callApi } from './apiClient'
import type { ApiReservation } from '@/types/api'

export async function listReservations(): Promise<ApiReservation[]> {
  const result = await callApi<{ reservations: ApiReservation[] }>('reservations.list')
  return result.reservations
}

export async function createReservation(bookId: string, userId?: string): Promise<ApiReservation> {
  const result = await callApi<{ reservation: ApiReservation }>(
    'reservations.create',
    userId ? { bookId, userId } : { bookId },
  )
  return result.reservation
}

export async function cancelReservation(reservationId: string): Promise<ApiReservation> {
  const result = await callApi<{ reservation: ApiReservation }>('reservations.cancel', { reservationId })
  return result.reservation
}
