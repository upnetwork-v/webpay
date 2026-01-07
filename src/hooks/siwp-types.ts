/**
 * Type definitions for SIWP (Sign-In with Passkey)
 */

import type { Principal } from '@dfinity/principal'

export type PublicKey = number[] | Uint8Array

export interface Delegation {
  pubkey: Uint8Array
  expiration: bigint
  targets?: Principal[]
}

export interface SignedDelegation {
  delegation: {
    pubkey: number[] | Uint8Array
    expiration: bigint
    targets: Principal[][]
  }
  signature: number[] | Uint8Array
}

export interface BindingDelegationDetails {
  username: string
  login_details: {
    expiration: bigint
    user_canister_pubkey: PublicKey
  }
}

export interface LoginResponse {
  Ok?: BindingDelegationDetails
  Err?: string
}

export interface DelegationResponse {
  Ok?: SignedDelegation
  Err?: string
}
