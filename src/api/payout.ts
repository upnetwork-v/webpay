/**
 * Payout API Module
 * Handles createPayout and getPayoutRecord operations
 */

import type {
  CreatePayoutParams,
  CreatePayoutResponse,
  PayoutRecordResponse,
} from '@/types/payout'

const PAYOUT_API_HOST = import.meta.env.VITE_PAYOUT_API_HOST

/**
 * Fetch wrapper for payout API
 */
async function payoutFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return response.json()
}

/**
 * Create a payout order
 * @param params - Payout creation parameters
 * @returns Payout order details including payment address and crypto amount
 */
export async function createPayout(
  params: CreatePayoutParams
): Promise<CreatePayoutResponse> {
  const url = `${PAYOUT_API_HOST}/payout/create`
  return payoutFetch<CreatePayoutResponse>(url, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/**
 * Get payout record status
 * @param id - Payout order ID
 * @returns Payout record with payment statuses
 */
export async function getPayoutRecord(
  id: string
): Promise<PayoutRecordResponse> {
  const url = `${PAYOUT_API_HOST}/payout/record/${id}`
  return payoutFetch<PayoutRecordResponse>(url, {
    method: 'GET',
  })
}
