/**
 * Delegation Chain utilities for ICP Identity
 * Adapted from upnetwork-v2
 */

import { DelegationChain, isDelegationValid } from '@dfinity/identity'

// Types for delegation data from canister
export interface SignedDelegation {
  delegation: {
    pubkey: number[] | Uint8Array
    expiration: bigint
    targets: unknown[][]
  }
  signature: number[] | Uint8Array
}

export type PublicKey = number[] | Uint8Array

/**
 * Creates a DelegationChain from the signed delegation returned by the canister.
 */
export function createDelegationChain(
  signedDelegation: SignedDelegation,
  publicKey: PublicKey
): DelegationChain {
  const delegations = [
    {
      delegation: {
        pubkey: Uint8Array.from(signedDelegation.delegation.pubkey as number[]),
        expiration: signedDelegation.delegation.expiration,
        targets:
          signedDelegation.delegation.targets.length > 0
            ? signedDelegation.delegation.targets[0]
            : undefined,
      },
      signature: Uint8Array.from(signedDelegation.signature as number[]),
    },
  ]

  return DelegationChain.fromDelegations(
    delegations as Parameters<typeof DelegationChain.fromDelegations>[0],
    Uint8Array.from(publicKey as number[])
  )
}

/**
 * Checks if a delegation chain is valid and not expired
 */
export function isDelegationChainValid(chain: DelegationChain): boolean {
  return isDelegationValid(chain)
}
