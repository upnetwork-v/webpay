import { getPayoutRecord } from '@/api/payout'
import { USDC_TOKEN_MINT } from '@/constants/token'
import type { PayoutData } from '@/types/payout'
import { createSPLTransferTransaction } from '@/utils/transaction'
import { useWallet } from '@/wallets/provider/useWallet'
import { Connection, Transaction } from '@solana/web3.js'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import bs58 from 'bs58'
import { useEffect, useMemo, useState } from 'react'

type PaymentStep = 'preview' | 'paying' | 'verifying' | 'success'

export const Route = createFileRoute('/wallet/pay/paynow/$payoutId')({
  component: PayNowPaymentComponent,
})

function PayNowPaymentComponent() {
  const navigate = useNavigate()
  const { payoutId } = Route.useParams() // Required path param
  const {
    adapter,
    state,
    signTransaction,
    sendRawTransaction,
    handlePaymentCallback,
  } = useWallet()

  // Extract wallet address and create connection
  const walletAddress = state.publicKey
  const wallet = adapter
  const connection = useMemo(
    () => new Connection(import.meta.env.VITE_SOLANA_RPC),
    []
  )

  // Payment flow state
  const [step, setStep] = useState<PaymentStep>('preview') // Start with preview
  const [payoutData, setPayoutData] = useState<PayoutData | null>(null)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [isPolling, setIsPolling] = useState(false)

  // Polling function for payout status
  const pollPayoutStatus = async (
    payoutId: string
  ): Promise<'success' | 'failed' | 'timeout'> => {
    const maxAttempts = 60 // 3 minutes
    const interval = 3000 // 3 seconds

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const record = await getPayoutRecord(payoutId)

        if (record.data) {
          const { cryptoPaymentStatus, fiatPaymentStatus } = record.data

          console.log(`[Poll ${i + 1}/${maxAttempts}] Status:`, {
            cryptoPaymentStatus,
            fiatPaymentStatus,
          })

          // ✅ Success: both crypto verified and fiat success
          if (
            cryptoPaymentStatus === 'verified' &&
            fiatPaymentStatus === 'success'
          ) {
            console.log('Payment fully completed!')
            return 'success'
          }

          // ❌ Failure: either failed
          if (
            cryptoPaymentStatus === 'failed' ||
            fiatPaymentStatus === 'failed'
          ) {
            console.log('Payment failed:', {
              cryptoPaymentStatus,
              fiatPaymentStatus,
            })
            return 'failed'
          }

          // ⏰ Expired
          if (cryptoPaymentStatus === 'expired') {
            console.log('Payment expired')
            return 'failed'
          }

          // Continue polling for pending/processing states
        }

        await new Promise((resolve) => setTimeout(resolve, interval))
      } catch (error) {
        console.error('Poll error:', error)
        // Continue polling even on error
      }
    }

    console.log('Polling timeout')
    return 'timeout'
  }

  // Load payout data from API if payoutId is provided
  useEffect(() => {
    if (payoutId && !payoutData) {
      console.log('[PayNow] Loading payout data for ID:', payoutId)
      const loadPayoutData = async () => {
        try {
          const record = await getPayoutRecord(payoutId)
          if (record.data) {
            console.log('[PayNow] Payout data loaded:', record.data)
            setPayoutData(record.data as PayoutData)
            // Set step based on payment status
            if (record.data.cryptoPaymentStatus === 'pending') {
              setStep('preview')
            } else if (
              (record.data.cryptoPaymentStatus === 'verified' &&
                record.data.fiatPaymentStatus === 'processing') ||
              record.data.fiatPaymentStatus === 'processing'
            ) {
              setStep('verifying')
              setIsPolling(true)
              // Start polling
              const pollResult = await pollPayoutStatus(payoutId)
              setIsPolling(false)
              if (pollResult === 'success') {
                setStep('success')
              } else {
                setError('Payment verification failed or timeout')
                setStep('preview')
              }
            } else if (
              record.data.cryptoPaymentStatus === 'verified' &&
              record.data.fiatPaymentStatus === 'success'
            ) {
              setStep('success')
            }
          }
        } catch (err) {
          console.error('[PayNow] Failed to load payout data:', err)
          setError('Failed to load payment information')
          navigate({ to: '/wallet' })
        }
      }
      loadPayoutData()
    }
  }, [payoutId, payoutData, navigate])
  // Handle Phantom payment callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const nonce = urlParams.get('nonce')
    const data = urlParams.get('data')
    const phantomPk = urlParams.get('phantom_encryption_public_key')

    // Handle payment response (not connection)
    if (nonce && data && !phantomPk && payoutId) {
      const processPaymentResponse = async () => {
        try {
          console.log('Processing payment response from Phantom...')

          // Process the callback
          const result = await handlePaymentCallback({
            nonce: nonce,
            data: data,
          })

          if (result.success && result.type === 'signTransaction') {
            if (
              typeof result.data === 'object' &&
              result.data !== null &&
              'transaction' in result.data &&
              typeof (result.data as { transaction?: unknown }).transaction ===
                'string'
            ) {
              // Signature successful, broadcast transaction
              try {
                const signedTxData = (result.data as { transaction: string })
                  .transaction
                const signedTransaction = Transaction.from(
                  bs58.decode(signedTxData)
                )
                const txHash = await sendRawTransaction(signedTransaction)
                console.log('Transaction broadcasted:', txHash)

                // Start polling payout status
                setStep('verifying')
                setLoading(true)
                setIsPolling(true)

                const pollResult = await pollPayoutStatus(payoutId)
                setIsPolling(false)

                if (pollResult === 'success') {
                  setStep('success')
                } else if (pollResult === 'failed') {
                  setError(
                    'Payment verification failed. Please contact support.'
                  )
                  setStep('preview')
                } else {
                  setError(
                    'Payment verification timeout. Please check your transaction status.'
                  )
                  setStep('preview')
                }

                setLoading(false)
                setLoading(false)
              } catch (broadcastError: any) {
                // Check if transaction was already processed
                const errorMessage =
                  broadcastError?.message || JSON.stringify(broadcastError)
                if (errorMessage.includes('already been processed')) {
                  console.log(
                    'Transaction already processed, proceeding to polling...'
                  )

                  // Proceed as success
                  setStep('verifying')
                  setLoading(true)
                  setIsPolling(true)

                  const pollResult = await pollPayoutStatus(payoutId)
                  setIsPolling(false)

                  if (pollResult === 'success') {
                    setStep('success')
                  } else {
                    // Handle other poll outcomes
                    setStep('preview') // Or appropriate step
                  }

                  setLoading(false)
                  return
                }

                console.error('Error broadcasting transaction:', broadcastError)
                setError(`Failed to broadcast transaction: ${broadcastError}`)
                setStep('preview')
                setLoading(false)
              }
            } else {
              setError('Payment response missing transaction data')
              setStep('preview')
              setLoading(false)
            }
          } else if (!result.success) {
            setError(result.error || 'Payment failed')
            setStep('preview')
            setLoading(false)
          }

          // Clean up the URL
          const cleanUrl = window.location.pathname
          window.history.replaceState({}, document.title, cleanUrl)
        } catch (err) {
          console.error('Error processing payment response:', err)
          setError(`Failed to process payment response: ${err}`)
          setStep('preview')
          setLoading(false)
        }
      }

      processPaymentResponse()
    }
  }, [handlePaymentCallback, sendRawTransaction, payoutId])

  // Only require payoutId (no input step needed)
  if (!payoutId) {
    console.log('[Render] No payoutId, redirecting to /wallet')
    navigate({ to: '/wallet' })
    return null
  }

  const handleCancel = () => {
    console.log('[handleCancel] Navigating to /wallet')
    navigate({ to: '/wallet' })
  }

  const handleConfirmPayment = async () => {
    if (!payoutData || !walletAddress || !wallet || !connection) {
      setError('Wallet not connected')
      return
    }

    setError('')
    setLoading(true)
    setStep('paying')

    try {
      // Convert crypto amount from smallest unit to USDC
      const usdcAmount = BigInt(payoutData.cryptoAmount)

      // Create transaction with orderId
      const transaction = await createSPLTransferTransaction({
        from: walletAddress.toBase58(),
        to: payoutData.paymentAddress,
        tokenAmount: usdcAmount.toString(),
        tokenAddress: USDC_TOKEN_MINT,
        orderId: payoutData.id,
      })

      // Sign transaction (may trigger deeplink)
      const signedTx = await signTransaction(transaction)

      // If we reach here, it's in-app browser (no deeplink)
      const signature = await sendRawTransaction(signedTx)
      console.log('Transaction sent:', signature)

      // Wait for confirmation
      setStep('verifying')
      setIsPolling(true)
      await connection.confirmTransaction(signature, 'confirmed')
      console.log('Transaction confirmed on-chain')

      // Poll payout status to verify fiat payment
      const pollResult = await pollPayoutStatus(payoutData.id)
      setIsPolling(false)

      if (pollResult === 'success') {
        setStep('success')
      } else if (pollResult === 'failed') {
        setError('Payment verification failed. Please contact support.')
        setStep('preview')
      } else {
        setError(
          'Payment verification timeout. Please check your transaction status.'
        )
        setStep('preview')
      }

      // Clean up sessionStorage on success
      sessionStorage.removeItem('paynow_payment_state')
    } catch (err) {
      console.error('Payment error:', err)

      // Handle Phantom deeplink redirect (not an error)
      if (err instanceof Error && err.message === 'PHANTOM_REDIRECT_PENDING') {
        console.log('Phantom wallet redirect pending, waiting for callback...')
        // Don't set error, keep loading state, let callback handle the rest
        return
      }

      // Real errors
      setError(
        'Payment failed: ' +
          (err instanceof Error ? err.message : 'Unknown error')
      )
      setStep('preview')
      setLoading(false)
    }
  }

  // Success Page
  if (step === 'success' && payoutData) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-green-600 to-green-800">
        {/* Success Header */}
        <div className="flex flex-col items-center justify-center px-6 pt-20 pb-12">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
            <svg
              className="h-10 w-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Order paid</h1>
        </div>

        {/* Transaction Summary Card */}
        <div className="flex-1 px-6">
          <div className="rounded-2xl bg-gray-800 p-6 shadow-xl">
            {/* Merchant Info */}
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-700">
                <span className="text-2xl">🍔</span>
              </div>
              <div>
                <div className="text-sm text-gray-400">Place</div>
                <div className="text-lg font-bold text-white">
                  {payoutData?.entityValue || 'Unknown'}
                </div>
              </div>
            </div>

            <div className="mb-4 border-t border-dashed border-gray-600 pt-4">
              {/* Fiat Amount */}
              <div className="mb-2 flex justify-between">
                <span className="text-gray-400">Pay in currency</span>
                <span className="font-bold text-white">
                  ${((payoutData.fiatAmount || 0) / 100).toFixed(2)}
                </span>
              </div>

              {/* Crypto Amount */}
              <div className="mb-4 flex justify-between">
                <span className="text-gray-400">In crypto</span>
                <span className="font-bold text-white">
                  {(
                    Number(payoutData.cryptoAmount || '0') /
                    Math.pow(10, payoutData.cryptoDecimal || 6)
                  ).toFixed(6)}{' '}
                  USDC
                </span>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-600 pt-4">
              {/* Order ID */}
              <div className="mb-2">
                <div className="text-sm text-gray-400">Order ID</div>
                <div className="font-mono text-white">PAYNOW</div>
              </div>

              {/* Order Time */}
              <div>
                <div className="text-sm text-gray-400">Order Time</div>
                <div className="text-white">
                  {new Date().toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <div className="p-6">
          <button
            onClick={handleCancel}
            className="w-full rounded-full bg-white px-6 py-4 text-lg font-semibold text-gray-900 shadow-lg transition hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <button
          onClick={handleCancel}
          className="text-lg text-white hover:text-gray-300"
        >
          Back
        </button>
        <h1 className="text-xl font-bold">PayNow</h1>
        <div className="w-16" /> {/* Spacer for centering */}
      </div>

      {/* Content */}
      <div className="flex-1 px-6">
        {/* Step 1: Input Amount */}

        {/* Step 2: Preview / Review & Confirm */}
        {step === 'preview' && payoutData && (
          <div className="space-y-6">
            {/* Token Icon */}
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500">
                <span className="text-2xl font-bold text-white">$</span>
              </div>
            </div>

            {/* Header */}
            <h2 className="text-center text-xl font-normal">
              Review & confirm withdrawing SGD to
              <br />
              <span className="font-bold">
                {payoutData?.entityValue || 'Unknown'}
              </span>
            </h2>

            {/* Transaction Details */}
            <div className="space-y-4 rounded-2xl bg-gray-800 p-6">
              {/* Send SGD */}
              <div className="flex justify-between">
                <span className="text-gray-400">Send SGD</span>
                <span className="font-semibold text-purple-400">
                  S$ {((payoutData.fiatAmount || 0) / 100).toFixed(2)}
                </span>
              </div>

              {/* Token Amount */}
              <div className="flex justify-between">
                <span className="text-gray-400">Token Amount</span>
                <span className="font-semibold text-white">
                  {(
                    Number(payoutData.cryptoAmount || '0') /
                    Math.pow(10, payoutData.cryptoDecimal || 6)
                  ).toFixed(6)}{' '}
                  USDC
                </span>
              </div>

              {/* PayNow ID */}
              <div className="flex justify-between">
                <span className="text-gray-400">PayNow ID</span>
                <span className="font-semibold text-purple-400">
                  {payoutData?.entityValue || 'Unknown'}
                </span>
              </div>

              {/* Receive Address */}
              <div className="flex justify-between">
                <span className="text-gray-400">Receive Address</span>
                <span className="font-mono text-sm text-white">
                  {payoutData.paymentAddress.slice(0, 6)}...
                  {payoutData.paymentAddress.slice(-6)}
                </span>
              </div>

              {/* Chain */}
              <div className="flex justify-between">
                <span className="text-gray-400">Chain</span>
                <span className="font-semibold text-white">Solana</span>
              </div>

              {/* Gas Fee */}
              <div className="flex justify-between">
                <span className="text-gray-400">Gas Fee</span>
                <span className="font-semibold text-white">SGD 0</span>
              </div>

              {/* Expires At */}
              <div className="flex justify-between">
                <span className="text-gray-400">Expires At</span>
                <span className="font-semibold text-purple-400">
                  {new Date(payoutData.orderExpiresAt).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-lg bg-red-900/50 p-4 text-red-200">
                {error}
              </div>
            )}

            {/* Confirm Transfer Button */}
            <button
              onClick={handleConfirmPayment}
              disabled={loading}
              className="w-full rounded-full bg-purple-400 px-6 py-4 text-lg font-semibold text-gray-900 transition hover:bg-purple-300 disabled:bg-gray-700 disabled:text-gray-500"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Processing...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>💳</span> Confirm transfer
                </span>
              )}
            </button>
          </div>
        )}

        {/* Step 3: Paying */}
        {(step === 'paying' || step === 'verifying') && payoutData && (
          <div className="space-y-6">
            {/* Token Icon */}
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500">
                <span className="text-2xl font-bold text-white">$</span>
              </div>
            </div>

            {/* Header */}
            <h2 className="text-center text-xl font-normal">
              Review & confirm withdrawing SGD to
              <br />
              <span className="font-bold">
                {payoutData?.entityValue || 'Unknown'}
              </span>
            </h2>

            {/* Transaction Details (same as preview) */}
            <div className="space-y-4 rounded-2xl bg-gray-800 p-6">
              <div className="flex justify-between">
                <span className="text-gray-400">Send SGD</span>
                <span className="font-semibold text-purple-400">
                  S$ {((payoutData.fiatAmount || 0) / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Token Amount</span>
                <span className="font-semibold text-white">
                  {(
                    Number(payoutData.cryptoAmount || '0') /
                    Math.pow(10, payoutData.cryptoDecimal || 6)
                  ).toFixed(6)}{' '}
                  USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">PayNow ID</span>
                <span className="font-semibold text-purple-400">
                  {payoutData?.entityValue || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Receive Address</span>
                <span className="font-mono text-sm text-white">
                  {payoutData.paymentAddress.slice(0, 6)}...
                  {payoutData.paymentAddress.slice(-6)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Chain</span>
                <span className="font-semibold text-white">Solana</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Gas Fee</span>
                <span className="font-semibold text-white">SGD 0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Expires At</span>
                <span className="font-semibold text-purple-400">
                  {new Date(payoutData.orderExpiresAt).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </span>
              </div>
            </div>

            {/* Loading Button */}
            <button
              disabled
              className="w-full rounded-full bg-gray-700 px-6 py-4 text-lg font-semibold text-gray-500"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {isPolling ? 'Verifying payment...' : 'Payment'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
