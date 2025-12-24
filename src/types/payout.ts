/**
 * PayNow QR Code Data Types
 */

export interface PayNowQRData {
  proxyType: 'phone' | 'nric' | 'uen' | 'unknown'
  proxyValue: string
  amount?: string
  currency?: string
  referenceId?: string
  merchantName?: string
  qrString: string
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

export interface CreatePayoutResponse {
  code: number
  msg: string
  data: {
    id: string // Payout order ID (used as orderId in Memo)
    fiatAmount: number
    fiatCurrency: string
    cryptoCurrency: string
    cryptoAmount: string // Amount to pay in smallest unit
    cryptoDecimal: number
    cryptoChain: string
    paymentAddress: string // ⭐ Receiving address for blockchain transfer
    exchangeRate: string
    orderExpiresAt: string
    orderExpiresAtTs: number
    cryptoPaymentStatus: 'pending' | 'verified' | 'failed' | 'expired'
    fiatPaymentStatus: 'pending' | 'processing' | 'success' | 'failed'
  } | null
}

export interface PayoutRecordResponse {
  code: number
  msg: string
  data: {
    id: string
    cryptoPaymentStatus: 'pending' | 'verified' | 'failed' | 'expired'
    fiatPaymentStatus: 'pending' | 'processing' | 'success' | 'failed'
  } | null
}
