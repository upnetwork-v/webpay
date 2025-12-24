import { PublicKey } from '@solana/web3.js'

/**
 * Convert a PublicKey or string to a PublicKey object
 * Avoids double-wrapping if input is already a PublicKey
 */
export function toPublicKey(key: PublicKey | string): PublicKey {
  return typeof key === 'string' ? new PublicKey(key) : key
}

/**
 * Convert a PublicKey or string to a base58 string
 */
export function toBase58(key: PublicKey | string): string {
  return typeof key === 'string' ? key : key.toBase58()
}

/**
 * Type guard to check if a value is a valid PublicKey
 */
export function isPublicKey(value: unknown): value is PublicKey {
  return value instanceof PublicKey
}

/**
 * Validate and parse a public key string
 * Returns null if the string is not a valid public key
 */
export function parsePublicKey(address: string): PublicKey | null {
  try {
    return new PublicKey(address)
  } catch {
    return null
  }
}
