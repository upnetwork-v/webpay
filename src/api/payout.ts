/**
 * Payout API Module
 * Handles createPayout and getPayoutRecord operations
 */

import type {
  CreatePayoutParams,
  CreatePayoutResponse,
  PaymentStatus,
  PayoutData,
  PayoutRecordData,
  PayoutRecordResponse,
} from '@/types/payout'

const PAYOUT_API_HOST = import.meta.env.VITE_PAYOUT_API_HOST

/**
 * Custom error class for Payout API errors
 */
export class PayoutAPIError extends Error {
  constructor(
    message: string,
    public code?: number,
    public response?: unknown
  ) {
    super(message)
    this.name = 'PayoutAPIError'
  }
}

/**
 * Fetch wrapper for payout API with error handling
 */
async function payoutFetch<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new PayoutAPIError(
        data.msg || `HTTP error! status: ${response.status}`,
        data.code || response.status,
        data
      )
    }

    // Check if API returned an error code (even with 200 status)
    if (data.code && data.code !== 200) {
      throw new PayoutAPIError(
        data.msg || 'API request failed',
        data.code,
        data
      )
    }

    return data
  } catch (error) {
    if (error instanceof PayoutAPIError) {
      throw error
    }
    throw new PayoutAPIError(
      error instanceof Error ? error.message : 'Network request failed'
    )
  }
}

/**
 * Create a payout order
 * @param params - Payout creation parameters
 * @returns Payout order details including payment address and crypto amount
 */
export async function createPayout(
  params: CreatePayoutParams
): Promise<CreatePayoutResponse> {
  if (!PAYOUT_API_HOST) {
    throw new PayoutAPIError('PAYOUT_API_HOST is not configured')
  }

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
  if (!PAYOUT_API_HOST) {
    throw new PayoutAPIError('PAYOUT_API_HOST is not configured')
  }

  const url = `${PAYOUT_API_HOST}/payout/record/${id}`
  return payoutFetch<PayoutRecordResponse>(url, {
    method: 'GET',
  })
}

/**
 * Helper: Check if payment is successful
 * Payment is successful when both crypto and fiat statuses are complete
 */
export function isPaymentSuccess(data: PayoutData | PayoutRecordData): boolean {
  return (
    data.cryptoPaymentStatus === 'verified' &&
    data.fiatPaymentStatus === 'success'
  )
}

/**
 * Helper: Check if payment has failed
 */
export function isPaymentFailed(data: PayoutData | PayoutRecordData): boolean {
  return (
    data.cryptoPaymentStatus === 'failed' || data.fiatPaymentStatus === 'failed'
  )
}

/**
 * Helper: Check if payment is expired
 */
export function isPaymentExpired(data: PayoutData | PayoutRecordData): boolean {
  return data.cryptoPaymentStatus === 'expired'
}

/**
 * Helper: Get overall payment status
 */
export function getPaymentStatus(
  data: PayoutData | PayoutRecordData
): PaymentStatus {
  if (isPaymentSuccess(data)) return 'success'
  if (isPaymentFailed(data)) return 'failed'
  if (isPaymentExpired(data)) return 'expired'
  if (data.fiatPaymentStatus === 'processing') return 'processing'
  return 'pending'
}

/**
 * Helper: Check if should continue polling
 */
export function shouldContinuePolling(
  data: PayoutData | PayoutRecordData
): boolean {
  const status = getPaymentStatus(data)
  return status === 'pending' || status === 'processing'
}
