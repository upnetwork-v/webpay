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
  entityValue: string // PayNow ID (phone/UEN)
  value: string // Amount in cents (e.g., "1000" = 10.00 SGD)
  currency: 'SGD'
  cryptoCurrency: 'USDC'
  cryptoChain: 'SOLANA'
  country: 'SG'
  remark?: string
  qrString?: string
}

export type CryptoPaymentStatus = 'pending' | 'verified' | 'failed' | 'expired'
export type FiatPaymentStatus = 'pending' | 'processing' | 'success' | 'failed'

export interface PayoutData {
  id: string // Payout order ID (used as orderId in Memo)
  fiatAmount: number
  fiatCurrency: string
  cryptoCurrency: string
  cryptoAmount: string // Amount to pay in smallest unit
  cryptoDecimal: number
  cryptoChain: string
  paymentAddress: string // ⭐ Receiving address for blockchain transfer
  exchangeRate: string
  orderExpiresAt: string // ISO timestamp
  orderExpiresAtTs: number // Unix timestamp in milliseconds
  cryptoPaymentStatus: CryptoPaymentStatus
  fiatPaymentStatus: FiatPaymentStatus
  // Additional fields that may be present
  entityType?: 'company' | 'individual'
  entityValue?: string
  country?: string
  remark?: string
  beneficiaryName?: string
}

export interface CreatePayoutResponse {
  code: number
  msg: string
  data: PayoutData | null
}

export interface PayoutRecordData {
  id: string
  cryptoPaymentStatus: CryptoPaymentStatus
  fiatPaymentStatus: FiatPaymentStatus
  // May include other fields from PayoutData
  fiatAmount?: number
  cryptoAmount?: string
  paymentAddress?: string
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
