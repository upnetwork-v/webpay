/**
 * Authentication Store - Refactored for Passkey/ICP Identity
 *
 * This store integrates ICP identity management with authentication state.
 * Replaces Google OAuth with Passkey-based authentication.
 */

import type { _SERVICE } from '@/libs/icp/service'
import type { ActorSubclass } from '@dfinity/agent'
import type { DelegationChain, DelegationIdentity } from '@dfinity/identity'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const AUTH_STORAGE_KEY = 'ontapay_auth'

// User type (minimal version for now, will be populated from backend)
export interface User {
  badge: number
  createdAt: string
  id: string
  inviteCode: string
  principal_id: string
  privilege: boolean
  transaction_limit: string
  transaction_total: string
  updatedAt: string
  username: string
  verified: 0 | 1 | 2 | 3 // KYC status
}

// Auth state interface
export interface AuthState {
  // Existing fields
  isAuthenticated: boolean
  user: User | null
  isLoading: boolean
  error: string | null

  // ICP Identity fields
  identity: DelegationIdentity | null
  identityId: string | null // username
  delegationChain: DelegationChain | null
  principalId: string | null
  identityActor: ActorSubclass<_SERVICE> | null
  anonymousActor: ActorSubclass<_SERVICE> | null

  // Auth Token fields
  authToken: string | null
  authTokenExpiry: number | null
}

// Auth actions interface
export interface AuthActions {
  // State management
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void

  // Identity management (to be called by login components)
  setIdentity: (
    identity: DelegationIdentity,
    identityId: string,
    delegationChain: DelegationChain,
    identityActor: ActorSubclass<_SERVICE>
  ) => void
  setAnonymousActor: (actor: ActorSubclass<_SERVICE>) => void

  // Auth token management
  setAuthToken: (token: string, expiry: number) => void
  clearAuthToken: () => void

  // User management
  setUser: (user: User) => void

  // Logout
  logout: () => void

  // Check auth (utility)
  checkAuth: () => boolean

  // Initialize (restore from storage)
  initialize: () => Promise<void>
}

export type AuthStore = AuthState & AuthActions

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial State
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null,

      identity: null,
      identityId: null,
      delegationChain: null,
      principalId: null,
      identityActor: null,
      anonymousActor: null,

      authToken: null,
      authTokenExpiry: null,

      // Actions
      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      setError: (error: string | null) => {
        set({ error, isLoading: false })
      },

      clearError: () => {
        set({ error: null })
      },

      setIdentity: (
        identity: DelegationIdentity,
        identityId: string,
        delegationChain: DelegationChain,
        identityActor: ActorSubclass<_SERVICE>
      ) => {
        const principalId = identity.getPrincipal().toString()

        set({
          identity,
          identityId,
          delegationChain,
          principalId,
          identityActor,
          isAuthenticated: true,
          error: null,
        })
      },

      setAnonymousActor: (actor: ActorSubclass<_SERVICE>) => {
        set({ anonymousActor: actor })
      },

      setAuthToken: (token: string, expiry: number) => {
        set({
          authToken: token,
          authTokenExpiry: expiry,
        })
      },

      clearAuthToken: () => {
        set({
          authToken: null,
          authTokenExpiry: null,
        })
      },

      setUser: (user: User) => {
        set({ user })
      },

      logout: () => {
        // Clear all auth state
        set({
          isAuthenticated: false,
          identity: null,
          identityId: null,
          delegationChain: null,
          principalId: null,
          identityActor: null,
          authToken: null,
          authTokenExpiry: null,
          user: null,
          isLoading: false,
          error: null,
        })

        // Clear localStorage
        localStorage.removeItem('siwp_identity')
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_token_expiry')
      },

      checkAuth: () => {
        const { identityId, identityActor, authToken } = get()
        const isAuth = !!(identityId && identityActor && authToken)

        const currentIsAuth = get().isAuthenticated
        if (isAuth !== currentIsAuth) {
          set({ isAuthenticated: isAuth })
        }

        return isAuth
      },

      initialize: async () => {
        // This is called on app startup
        // The actual identity loading is done by useSIWPIdentity hook
        // This just checks the state
        const { identityId, identityActor } = get()
        if (identityId && identityActor) {
          set({ isAuthenticated: true })
        }
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({
        // Only persist minimal state
        // Identity and tokens are managed by their respective hooks
        isAuthenticated: state.isAuthenticated,
        identityId: state.identityId,
        principalId: state.principalId,
        user: state.user,
      }),
    }
  )
)

// Helper function to get auth token for API calls
export const getAuthToken = (): string | null => {
  return useAuthStore.getState().authToken
}

// Helper function to check if user is authenticated
export const isAuthenticated = (): boolean => {
  return useAuthStore.getState().checkAuth()
}
