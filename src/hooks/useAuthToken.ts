/**
 * Auth Token Management Hook
 *
 * Manages ICP-based authentication tokens for backend API calls.
 * Adapted from upnetwork-v2's useAuthProvider.
 */

import type { ActorSubclass } from '@dfinity/agent'
import { useCallback, useEffect, useState } from 'react'
import type { _SERVICE } from '../libs/icp/service'

const AUTH_TOKEN_STORAGE_KEY = 'auth_token'
const AUTH_TOKEN_EXPIRY_KEY = 'auth_token_expiry'
const TOKEN_VALIDITY_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface AuthSig {
  message: string
  signature: string
  expiresAt: number
  identityId: string
}

export interface VerifyPrincipalResponse {
  authToken: string
}

export function useAuthToken(
  identityId?: string,
  identityActor?: ActorSubclass<_SERVICE> | null
) {
  const [authToken, setAuthToken] = useState<string | undefined>()
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Get auth signature from Canister
  const getAuthSignature = useCallback(async (): Promise<
    AuthSig | undefined
  > => {
    if (!identityId || !identityActor) {
      return undefined
    }

    try {
      // Call canister's sign_principal method
      const result = await identityActor.sign_principal()

      // Type assertion based on upnetwork-v2 implementation
      const { message, signature } = result as unknown as {
        message: string
        signature: string
      }

      const expiresAt = Date.now() + TOKEN_VALIDITY_MS

      return {
        message,
        signature,
        expiresAt,
        identityId,
      }
    } catch (error) {
      console.error('Failed to get auth signature:', error)
      return undefined
    }
  }, [identityId, identityActor])

  // Verify principal and get auth token
  const verifyPrincipal = useCallback(
    async (message: string, signature: string): Promise<string | undefined> => {
      try {
        const apiHost = import.meta.env.VITE_UP_SERVICE_API_HOST
        const response = await fetch(`${apiHost}/api/auth/verify_principal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message, signature }),
        })

        if (response.status !== 200) {
          throw new Error('Failed to verify principal')
        }

        const data: VerifyPrincipalResponse = await response.json()
        return data.authToken
      } catch (error) {
        console.error('Failed to verify principal:', error)
        return undefined
      }
    },
    []
  )

  // Refresh auth token
  const refreshAuthToken = useCallback(async (): Promise<
    string | undefined
  > => {
    if (!identityId || !identityActor) {
      return undefined
    }

    setIsRefreshing(true)
    try {
      // Get new signature
      const authSig = await getAuthSignature()
      if (!authSig) {
        throw new Error('Failed to get auth signature')
      }

      // Verify and get token
      const token = await verifyPrincipal(authSig.message, authSig.signature)
      if (!token) {
        throw new Error('Failed to get auth token')
      }

      // Store token
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
      localStorage.setItem(AUTH_TOKEN_EXPIRY_KEY, authSig.expiresAt.toString())
      setAuthToken(token)

      return token
    } catch (error) {
      console.error('Failed to refresh auth token:', error)
      return undefined
    } finally {
      setIsRefreshing(false)
    }
  }, [identityId, identityActor, getAuthSignature, verifyPrincipal])

  // Get auth token (with automatic refresh if expired)
  const getAuthToken = useCallback(async (): Promise<string | undefined> => {
    // Check if we have a valid token in memory
    if (authToken) {
      const expiry = localStorage.getItem(AUTH_TOKEN_EXPIRY_KEY)
      if (expiry && parseInt(expiry) > Date.now()) {
        return authToken
      }
    }

    // Check localStorage
    const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    const storedExpiry = localStorage.getItem(AUTH_TOKEN_EXPIRY_KEY)

    if (storedToken && storedExpiry && parseInt(storedExpiry) > Date.now()) {
      setAuthToken(storedToken)
      return storedToken
    }

    // Token expired or doesn't exist, refresh
    return await refreshAuthToken()
  }, [authToken, refreshAuthToken])

  // Initialize token from storage
  useEffect(() => {
    const loadToken = async () => {
      if (!identityId || !identityActor) {
        setAuthToken(undefined)
        return
      }

      // Try to load from storage
      const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
      const storedExpiry = localStorage.getItem(AUTH_TOKEN_EXPIRY_KEY)

      if (storedToken && storedExpiry && parseInt(storedExpiry) > Date.now()) {
        setAuthToken(storedToken)
      } else {
        // Refresh if expired
        await refreshAuthToken()
      }
    }

    loadToken()
  }, [identityId, identityActor, refreshAuthToken])

  // Clear token
  const clearAuthToken = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(AUTH_TOKEN_EXPIRY_KEY)
    setAuthToken(undefined)
  }, [])

  return {
    authToken,
    isRefreshing,
    getAuthToken,
    refreshAuthToken,
    clearAuthToken,
  }
}
