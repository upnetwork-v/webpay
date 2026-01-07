/**
 * Web-adapted Sign-In with Passkey (SIWP) Identity Hook
 *
 * This is adapted from upnetwork-v2's useSIWPIdentity for Web environment.
 * Main differences:
 * - Uses Web Crypto API instead of React Native Passkey
 * - Uses localStorage instead of MMKV/SQLite
 * - No AppState listeners
 */

import type { ActorSubclass, HttpAgentOptions } from '@dfinity/agent'
import { Actor, HttpAgent } from '@dfinity/agent'
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
} from '@dfinity/identity'
import { useCallback, useEffect, useState } from 'react'
import { idlFactory, type _SERVICE } from '../libs/icp/service'

// Storage keys
const IDENTITY_STORAGE_KEY = 'siwp_identity'

// Types
export interface IdentityStore {
  uid: string
  delegationChain: DelegationChain
  delegationIdentity: DelegationIdentity
}

export interface SiwpIdentityStorage {
  uid: string
  sessionIdentity: object | string // Can be JsonnableEd25519KeyIdentity or string
  delegationChain: object | string // Can be JsonnableDelegationChain or string
}

export interface PrepareLoginResponse {
  challengeMessage: string
  username?: string
}

// Actor creation helper
function createActor(
  canisterId: string,
  identity?: DelegationIdentity,
  httpAgentOptions?: HttpAgentOptions
): { actor: ActorSubclass<_SERVICE>; agent: HttpAgent } {
  const agent = HttpAgent.createSync({
    host: import.meta.env.VITE_ICP_HOST_URL,
    ...httpAgentOptions,
    identity,
  })

  if (import.meta.env.VITE_ICP_IS_LOCAL === 'true') {
    agent.fetchRootKey().catch(console.error)
  }

  const actor = Actor.createActor<_SERVICE>(idlFactory, {
    agent,
    canisterId,
  })

  return { actor, agent }
}

export function useSIWPIdentity() {
  const [isInitializing, setIsInitializing] = useState(true)
  const [isLoggingIn, _setIsLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState<Error | null>(null)
  const [identityStore, setIdentityStore] = useState<IdentityStore | null>(null)
  const [anonymousActor, setAnonymousActor] =
    useState<ActorSubclass<_SERVICE> | null>(null)
  const [identityActor, setIdentityActor] =
    useState<ActorSubclass<_SERVICE> | null>(null)

  const canisterId = import.meta.env.VITE_ICP_CANISTER_ID

  // Initialize anonymous actor
  useEffect(() => {
    const { actor } = createActor(canisterId)
    setAnonymousActor(actor)
  }, [canisterId])

  // Load identity from localStorage
  const loadIdentity = useCallback(async () => {
    setIsInitializing(true)
    try {
      const stored = localStorage.getItem(IDENTITY_STORAGE_KEY)
      if (!stored) {
        setIdentityStore(null)
        return
      }

      const parsed: SiwpIdentityStorage = JSON.parse(stored)
      if (!parsed.uid || !parsed.sessionIdentity || !parsed.delegationChain) {
        throw new Error('Stored state is invalid')
      }

      // Parse the stored strings back to proper objects
      const delegationChainData =
        typeof parsed.delegationChain === 'string'
          ? JSON.parse(parsed.delegationChain)
          : parsed.delegationChain

      const sessionIdentityData =
        typeof parsed.sessionIdentity === 'string'
          ? parsed.sessionIdentity
          : JSON.stringify(parsed.sessionIdentity)

      const delegationChain = DelegationChain.fromJSON(delegationChainData)
      const sessionIdentity = Ed25519KeyIdentity.fromJSON(sessionIdentityData)
      const delegationIdentity = DelegationIdentity.fromDelegation(
        sessionIdentity,
        delegationChain
      )

      // Create identity actor
      const { actor } = createActor(canisterId, delegationIdentity)
      setIdentityActor(actor)

      setIdentityStore({
        uid: parsed.uid,
        delegationChain,
        delegationIdentity,
      })
    } catch (error) {
      console.error('Failed to load identity:', error)
      localStorage.removeItem(IDENTITY_STORAGE_KEY)
      setIdentityStore(null)
    } finally {
      setIsInitializing(false)
    }
  }, [canisterId])

  // Save identity to localStorage
  const saveIdentity = useCallback(
    (
      uid: string,
      sessionIdentity: Ed25519KeyIdentity,
      delegationChain: DelegationChain
    ) => {
      const data: SiwpIdentityStorage = {
        uid,
        sessionIdentity: JSON.stringify(sessionIdentity.toJSON()),
        delegationChain: JSON.stringify(delegationChain.toJSON()),
      }
      localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(data))

      const delegationIdentity = DelegationIdentity.fromDelegation(
        sessionIdentity,
        delegationChain
      )

      // Create identity actor
      const { actor } = createActor(canisterId, delegationIdentity)
      setIdentityActor(actor)

      setIdentityStore({
        uid,
        delegationChain,
        delegationIdentity,
      })
    },
    [canisterId]
  )

  // Logout
  const logout = useCallback(() => {
    localStorage.removeItem(IDENTITY_STORAGE_KEY)
    setIdentityStore(null)
    setIdentityActor(null)
    setLoginError(null)
  }, [])

  // Load identity on mount
  useEffect(() => {
    loadIdentity()
  }, [loadIdentity])

  return {
    // State
    isInitializing,
    isLoggingIn,
    loginError,
    identityStore,
    anonymousActor,
    identityActor,
    identityId: identityStore?.uid,
    identity: identityStore?.delegationIdentity,

    // Actions
    saveIdentity,
    logout,
    loadIdentity,
  }
}
