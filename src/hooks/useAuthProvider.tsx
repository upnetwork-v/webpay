/**
 * Authentication Provider Context
 *
 * Provides authentication state and methods throughout the application.
 * Integrates SIWP Identity with auth token management.
 */

import { idlFactory, type _SERVICE } from '@/libs/icp/service'
import { useAuthStore } from '@/stores'
import type { ActorSubclass } from '@dfinity/agent'
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
} from '@dfinity/identity'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createDelegationChain } from './delegation'
import {
  callGetDelegation,
  callLogin,
  callPrepareLogin,
  createAnonymousActor,
} from './siwp-provider'

// Storage keys
const IDENTITY_STORAGE_KEY = 'siwp_identity'
const AUTH_TOKEN_STORAGE_KEY = 'auth_token'
const AUTH_TOKEN_EXPIRY_KEY = 'auth_token_expiry'

// Context types
interface AuthContextType {
  // State
  isInitializing: boolean
  isLoggedIn: boolean
  isLoggingIn: boolean
  loginError: string | null
  identityId: string | null
  authToken: string | null

  // Actions
  login: (username?: string) => Promise<void>
  logout: () => void
  getAuthToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Provider props
interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  // Local state
  const [isInitializing, setIsInitializing] = useState(true)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [anonymousActor, setAnonymousActor] =
    useState<ActorSubclass<_SERVICE> | null>(null)

  // Global store
  const authStore = useAuthStore()

  // Config
  const canisterId = import.meta.env.VITE_ICP_CANISTER_ID
  const hostUrl = import.meta.env.VITE_ICP_HOST_URL
  const isLocal = import.meta.env.VITE_ICP_IS_LOCAL === 'true'

  // Initialize anonymous actor
  useEffect(() => {
    const result = createAnonymousActor({
      idlFactory,
      canisterId,
      httpAgentOptions: { host: hostUrl },
      isLocalNetwork: isLocal,
    })

    if (result) {
      setAnonymousActor(result.actor)
      authStore.setAnonymousActor(result.actor)
    }
  }, [canisterId, hostUrl, isLocal])

  // Load identity from storage on mount
  useEffect(() => {
    const loadIdentity = async () => {
      try {
        const stored = localStorage.getItem(IDENTITY_STORAGE_KEY)
        if (!stored) {
          setIsInitializing(false)
          return
        }

        const parsed = JSON.parse(stored)
        if (!parsed.uid || !parsed.sessionIdentity || !parsed.delegationChain) {
          localStorage.removeItem(IDENTITY_STORAGE_KEY)
          setIsInitializing(false)
          return
        }

        // Parse stored data
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
        const identity = DelegationIdentity.fromDelegation(
          sessionIdentity,
          delegationChain
        )

        // Create identity actor
        const result = createAnonymousActor({
          idlFactory,
          canisterId,
          httpAgentOptions: { host: hostUrl, identity },
          isLocalNetwork: isLocal,
        })

        if (result) {
          authStore.setIdentity(
            identity,
            parsed.uid,
            delegationChain,
            result.actor
          )
        }

        // Load auth token
        const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
        const storedExpiry = localStorage.getItem(AUTH_TOKEN_EXPIRY_KEY)
        if (
          storedToken &&
          storedExpiry &&
          parseInt(storedExpiry) > Date.now()
        ) {
          authStore.setAuthToken(storedToken, parseInt(storedExpiry))
        }
      } catch (error) {
        console.error('Failed to load identity:', error)
        localStorage.removeItem(IDENTITY_STORAGE_KEY)
      } finally {
        setIsInitializing(false)
      }
    }

    loadIdentity()
  }, [canisterId, hostUrl, isLocal])

  // Login with Passkey
  const login = useCallback(
    async (username?: string) => {
      if (!anonymousActor) {
        throw new Error('Actor not initialized')
      }

      // Check WebAuthn support
      if (!window.PublicKeyCredential) {
        setLoginError(
          '当前浏览器不支持 Passkey，请使用 Chrome/Safari/Edge 最新版本'
        )
        throw new Error('WebAuthn not supported')
      }

      setIsLoggingIn(true)
      setLoginError(null)

      try {
        // Step 1: Prepare login and get WebAuthn response
        const prepareResponse = await callPrepareLogin(anonymousActor, username)

        let webauthnResponse: string
        let authenticationState: string | undefined

        if (Array.isArray(prepareResponse)) {
          webauthnResponse = prepareResponse[0]
          authenticationState = prepareResponse[1]
        } else {
          webauthnResponse = prepareResponse
        }

        // Step 2: Generate session key
        const sessionIdentity = Ed25519KeyIdentity.generate()
        const sessionPublicKey = sessionIdentity.getPublicKey().toDer()

        // Step 3: Call login on canister
        const expiration = 7 * 24 * 60 * 60 * 1000 // 7 days
        const loginResult = await callLogin(
          anonymousActor,
          webauthnResponse,
          sessionPublicKey,
          authenticationState,
          username,
          expiration
        )

        // Step 4: Get delegation
        const signedDelegation = await callGetDelegation(
          anonymousActor,
          loginResult.username,
          sessionPublicKey,
          loginResult.login_details.expiration
        )

        // Step 5: Create delegation chain and identity
        const delegationChain = createDelegationChain(
          signedDelegation,
          loginResult.login_details.user_canister_pubkey
        )

        const identity = DelegationIdentity.fromDelegation(
          sessionIdentity,
          delegationChain
        )

        // Step 6: Create identity actor
        const identityActorResult = createAnonymousActor({
          idlFactory,
          canisterId,
          httpAgentOptions: { host: hostUrl, identity },
          isLocalNetwork: isLocal,
        })

        if (!identityActorResult) {
          throw new Error('Failed to create identity actor')
        }

        // Step 7: Save to localStorage
        const storageData = {
          uid: loginResult.username,
          sessionIdentity: JSON.stringify(sessionIdentity.toJSON()),
          delegationChain: JSON.stringify(delegationChain.toJSON()),
        }
        localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(storageData))

        // Step 8: Get auth token
        const authToken = await getAuthTokenFromCanister(
          identityActorResult.actor
        )
        if (authToken) {
          const tokenExpiry = Date.now() + 24 * 60 * 60 * 1000
          localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, authToken)
          localStorage.setItem(AUTH_TOKEN_EXPIRY_KEY, tokenExpiry.toString())
          authStore.setAuthToken(authToken, tokenExpiry)
        }

        // Step 9: Update store
        authStore.setIdentity(
          identity,
          loginResult.username,
          delegationChain,
          identityActorResult.actor
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '登录失败，请重试'
        setLoginError(message)
        throw error
      } finally {
        setIsLoggingIn(false)
      }
    },
    [anonymousActor, canisterId, hostUrl, isLocal, authStore]
  )

  // Logout
  const logout = useCallback(() => {
    localStorage.removeItem(IDENTITY_STORAGE_KEY)
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(AUTH_TOKEN_EXPIRY_KEY)
    authStore.logout()
    setLoginError(null)
  }, [authStore])

  // Get auth token from Canister
  const getAuthTokenFromCanister = async (
    actor: ActorSubclass<_SERVICE>
  ): Promise<string | null> => {
    try {
      const result = await actor.sign_principal()
      const { message, signature } = result as unknown as {
        message: string
        signature: string
      }

      const apiHost = import.meta.env.VITE_UP_SERVICE_API_HOST
      const response = await fetch(`${apiHost}/api/auth/verify_principal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      })

      if (response.status !== 200) {
        throw new Error('Failed to verify principal')
      }

      const data = await response.json()
      return data.authToken
    } catch (error) {
      console.error('Failed to get auth token:', error)
      return null
    }
  }

  // Get auth token (with auto-refresh)
  const getAuthToken = useCallback(async (): Promise<string | null> => {
    // Check if current token is valid
    const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    const storedExpiry = localStorage.getItem(AUTH_TOKEN_EXPIRY_KEY)

    if (storedToken && storedExpiry && parseInt(storedExpiry) > Date.now()) {
      return storedToken
    }

    // Token expired, try to refresh
    const identityActor = authStore.identityActor
    if (!identityActor) {
      return null
    }

    const newToken = await getAuthTokenFromCanister(identityActor)
    if (newToken) {
      const tokenExpiry = Date.now() + 24 * 60 * 60 * 1000
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, newToken)
      localStorage.setItem(AUTH_TOKEN_EXPIRY_KEY, tokenExpiry.toString())
      authStore.setAuthToken(newToken, tokenExpiry)
    }

    return newToken
  }, [authStore])

  const contextValue = useMemo(
    () => ({
      isInitializing,
      isLoggedIn: authStore.isAuthenticated,
      isLoggingIn,
      loginError,
      identityId: authStore.identityId,
      authToken: authStore.authToken,
      login,
      logout,
      getAuthToken,
    }),
    [
      isInitializing,
      isLoggingIn,
      loginError,
      authStore.isAuthenticated,
      authStore.identityId,
      authStore.authToken,
      login,
      logout,
      getAuthToken,
    ]
  )

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  )
}
