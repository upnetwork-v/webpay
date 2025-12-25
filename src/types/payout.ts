/**
 * PayNow QR Code Data Types (matching paynow.ts export)
 */

export interface PayNowQRData {
  // Proxy info
  proxyType: 'phone' | 'nric' | 'uen' | 'unknown'
  proxyTypeCode: string // Original code: 0, 2, 4
  proxyValue: string // Phone number, NRIC/FIN, or UEN

  // Payment info (optional)
  amount?: string // Transaction amount
  currency?: string // Currency code (usually SGD)
  referenceId?: string // Reference/Order number
  description?: string // Description

  // Merchant info (optional)
  merchantName?: string
  merchantCity?: string
  countryCode?: string // Usually 'SG'

  // Raw data
  rawData: Record<string, string> // All parsed raw fields
  networkSpecificData: Record<string, string> // Data inside Tag 26
}

/**
 * Payout API Types
 */

export interface CreatePayoutParams {
  entityType: 'company' | 'individual'
  entityValue: string // PayNow ID (phone/UEN) or PayMongo Account
  value: string // Amount in cents (e.g., "1000" = 10.00 SGD/PHP)
  currency: 'SGD' | 'PHP'
  cryptoCurrency: 'USDC'
  cryptoChain: 'SOLANA'
  country: 'SG' | 'PH'
  remark?: string
  qrString?: string
  // PayMongo specific fields
  accountType?: string
  purpose?: string
}

export type CryptoPaymentStatus = 'pending' | 'verified' | 'failed' | 'expired'
export type FiatPaymentStatus = 'pending' | 'processing' | 'success' | 'failed'

export interface PayoutData {
  id: string // Payout order ID (used as orderId in Memo)
  requestId: string
  externalId: string | null
  creationTime: string
  lastUpdateTime: string
  amount: number // Amount in cents
  currency: string
  provider: string
  purpose: string | null
  message: string | null
  remark: string | null
  cryptoCurrency: string
  cryptoChain: string
  cryptoAmount: string // Amount to pay in smallest unit
  exchangeRate: string
  orderExpiresAt: string // ISO timestamp
  cryptoPaymentStatus: CryptoPaymentStatus
  fiatPaymentStatus: FiatPaymentStatus
  paymentAddress: string // ⭐ Receiving address for blockchain transfer
  orderExpiresAtTs: number // Unix timestamp in milliseconds
  qrString?: string

  // Fields that might differ or be optional based on endpoint
  beneficiaryId?: string
}

export interface CreatePayoutResponse {
  code: number
  msg: string
  data: PayoutData | null
}

export interface PayoutRecordData extends Partial<PayoutData> {
  id: string
  cryptoPaymentStatus: CryptoPaymentStatus
  fiatPaymentStatus: FiatPaymentStatus
}

export interface PayoutRecordResponse {
  code: number
  msg: string
  data: PayoutRecordData | null
}

/**
 * Payment status helper type
 */
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'failed'
  | 'expired'
