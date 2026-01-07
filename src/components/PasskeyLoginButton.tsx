/**
 * Passkey Login Button Component
 *
 * Provides a user-friendly button to trigger WebAuthn Passkey authentication.
 * Integrates with AuthProvider for actual login functionality.
 *
 * Note: Matches upnetwork-v2 behavior - no username input, uses browser auto-discovery.
 */

import { useAuth } from '@/hooks/useAuthProvider'
import { useNavigate } from '@tanstack/react-router'
import React, { useState } from 'react'

interface PasskeyLoginButtonProps {
  className?: string
  children?: React.ReactNode
  onLoginStart?: () => void
  onLoginSuccess?: () => void
  onLoginError?: (error: string) => void
  redirectTo?: string
}

export const PasskeyLoginButton: React.FC<PasskeyLoginButtonProps> = ({
  className = 'bg-gradient-to-b from-white rounded-full to-neutral-200 border-[0] text-neutral btn btn-primary btn-block btn-lg font-normal',
  children = 'Login with Passkey',
  onLoginStart,
  onLoginSuccess,
  onLoginError,
  redirectTo,
}) => {
  const [isLoading, setIsLoading] = useState(false)
  const { login, isLoggingIn, loginError } = useAuth()
  const navigate = useNavigate()

  const handlePasskeyLogin = async () => {
    // Check if WebAuthn is supported
    if (!window.PublicKeyCredential) {
      const errorMsg =
        '当前浏览器不支持 Passkey，请使用 Chrome/Safari/Edge 最新版本'
      onLoginError?.(errorMsg)
      return
    }

    setIsLoading(true)
    onLoginStart?.()

    try {
      // Login without username - uses browser auto-discovery (consistent with upnetwork-v2)
      await login()
      onLoginSuccess?.()

      // Redirect after successful login
      if (redirectTo) {
        navigate({ to: redirectTo })
      } else {
        const savedRoute =
          sessionStorage.getItem('ontapay_redirect_route') || '/wallet'
        sessionStorage.removeItem('ontapay_redirect_route')
        navigate({ to: savedRoute })
      }
    } catch (error) {
      console.error('Passkey login failed:', error)
      const errorMessage =
        error instanceof Error ? error.message : '登录失败，请重试'
      onLoginError?.(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const isButtonLoading = isLoading || isLoggingIn

  return (
    <div className="space-y-4">
      <button
        className={className}
        onClick={handlePasskeyLogin}
        type="button"
        disabled={isButtonLoading}
      >
        {isButtonLoading && (
          <span className="loading loading-spinner loading-xs mr-2"></span>
        )}
        {/* Passkey Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        {isButtonLoading ? '登录中...' : children}
      </button>

      {/* Error display */}
      {loginError && (
        <div className="alert alert-error">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 shrink-0 stroke-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{loginError}</span>
        </div>
      )}
    </div>
  )
}

export default PasskeyLoginButton
