import type { Message } from '@/api/siws'
import { generateMessage, verifySignature } from '@/api/siws'
import { useAuthStore } from '@/stores'
import { useWallet } from '@/wallets/provider/useWallet'
import bs58 from 'bs58'
import { useCallback, useState } from 'react'

/**
 * 格式化 SIWS 消息为签名字符串
 * 符合 EIP-4361 / SIWS 标准格式
 */
function formatSIWSMessage(message: Message): string {
  return `${message.domain} wants you to sign in with your Solana account:
${message.address}

${message.statement}

URI: ${message.uri}
Version: ${message.version}
Chain ID: ${message.chainId}
Nonce: ${message.nonce}
Issued At: ${message.issuedAt}
Expiration Time: ${message.expirationTime}`
}

export interface UseSIWSResult {
  signIn: () => Promise<{
    success: boolean
    needsConnect?: boolean
    pending?: boolean
    error?: string
  }>
  handleSignInCallback: (params: Record<string, string>) => Promise<{
    success: boolean
    error?: string
  }>
  isSigningIn: boolean
  error: string | null
  clearError: () => void
}

export function useSIWS(): UseSIWSResult {
  const { state, adapter, openWalletSelector, handleSignMessageCallback } =
    useWallet()
  const { login } = useAuthStore()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async () => {
    try {
      setError(null)
      setIsSigningIn(true)

      // 1. 确保钱包已连接
      if (!state.isConnected || !state.publicKey) {
        openWalletSelector()
        return { success: false, needsConnect: true }
      }

      // 2. 检查适配器是否支持 signMessage
      if (!adapter?.signMessage) {
        throw new Error('Wallet does not support message signing')
      }

      // 3. 获取待签名消息
      const chainId = 'solana'
      const messageData = await generateMessage({
        address: state.publicKey,
        chainId,
      })

      if (!messageData) {
        throw new Error('Failed to generate SIWS message')
      }

      // 4. 格式化并签名消息
      const messageString = formatSIWSMessage(messageData)
      const messageBytes = new TextEncoder().encode(messageString)

      const signatureBytes = await adapter.signMessage(messageBytes)
      const signatureBase58 = bs58.encode(signatureBytes)

      // 5. 验证签名获取 token
      const authData = await verifySignature({
        address: state.publicKey,
        signature: signatureBase58,
      })

      if (!authData) {
        throw new Error('Signature verification failed')
      }

      // 6. 登录并获取用户信息
      await login(authData.authToken, state.publicKey)

      return { success: true }
    } catch (err) {
      // 处理 Phantom deeplink 重定向
      if (
        err instanceof Error &&
        err.message === 'PHANTOM_SIGN_MESSAGE_PENDING'
      ) {
        return { success: false, pending: true }
      }

      const errorMessage = err instanceof Error ? err.message : 'Sign in failed'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setIsSigningIn(false)
    }
  }, [state, adapter, login, openWalletSelector])

  // 处理 signMessage 回调 (Phantom mobile deeplink)
  const handleSignInCallback = useCallback(
    async (params: Record<string, string>) => {
      console.log('[useSIWS] handleSignInCallback called with params:', params)
      try {
        setIsSigningIn(true)
        const result = await handleSignMessageCallback(params)

        if (result.success && result.type === 'signMessage') {
          const signatureData = result.data as { signature: string }

          // 验证签名获取 token
          const authData = await verifySignature({
            address: state.publicKey!,
            signature: signatureData.signature,
          })

          if (!authData) {
            throw new Error('Signature verification failed')
          }

          // 登录
          await login(authData.authToken, state.publicKey!)

          return { success: true }
        } else if (!result.success) {
          throw new Error(result.error || 'Sign in callback failed')
        }

        return { success: false, error: 'Unknown callback type' }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Sign in callback failed'
        setError(errorMessage)
        return { success: false, error: errorMessage }
      } finally {
        setIsSigningIn(false)
      }
    },
    [state.publicKey, login, handleSignMessageCallback]
  )

  return {
    signIn,
    handleSignInCallback,
    isSigningIn,
    error,
    clearError: () => setError(null),
  }
}
