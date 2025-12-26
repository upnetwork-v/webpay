import { createPayout, PayoutAPIError } from '@/api/payout'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface PayMongoInputSearchParams {
  entityValue: string
  entityType?: 'individual' | 'company'
  merchantName?: string
  qrString?: string
  purpose?: string
  accountType?: string
}

export const Route = createFileRoute('/wallet/pay/paymongo/')({
  component: PayMongoInputPage,
  validateSearch: (
    search: Record<string, unknown>
  ): PayMongoInputSearchParams => {
    return {
      entityValue: (search.entityValue as string) || '',
      entityType: search.entityType as 'individual' | 'company' | undefined,
      merchantName: search.merchantName as string | undefined,
      qrString: search.qrString as string | undefined,
      purpose: search.purpose as string | undefined,
      accountType: search.accountType as string | undefined,
    }
  },
})

// USDC/PHP exchange rate (approximately 0.017 USDC per 1 PHP)
// In production, this should be fetched from a price oracle API
const DEFAULT_USDC_PHP_RATE = 0.017

function PayMongoInputPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  console.log('[PayMongoInputPage] search:', search)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exchangeRate, setExchangeRate] = useState<number>(
    DEFAULT_USDC_PHP_RATE
  )
  const [rateLoading, setRateLoading] = useState(true)

  // Fetch exchange rate on mount (simulated - in production use real API)
  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        setRateLoading(true)
        // In a real implementation, this would call a price oracle API
        // For now, we use a reasonable default rate
        // const response = await fetch('...')
        // const data = await response.json()
        // setExchangeRate(data.rate)
        setExchangeRate(DEFAULT_USDC_PHP_RATE)
      } catch (err) {
        console.warn('[PayMongoInput] Failed to fetch exchange rate:', err)
        // Keep using default rate on error
      } finally {
        setRateLoading(false)
      }
    }
    fetchExchangeRate()

    // Refresh rate periodically (every 30 seconds)
    const interval = setInterval(fetchExchangeRate, 30000)
    return () => clearInterval(interval)
  }, [])

  // Calculate estimated USDC amount based on PHP input
  const estimatedUSDC = useMemo(() => {
    if (!amount || isNaN(parseFloat(amount))) return '0.000000'
    const phpAmount = parseFloat(amount)
    const usdcAmount = phpAmount * exchangeRate
    return usdcAmount.toFixed(6)
  }, [amount, exchangeRate])

  // Format exchange rate display
  const formatExchangeRate = useCallback(() => {
    return exchangeRate.toFixed(6)
  }, [exchangeRate])

  const handleContinue = async () => {
    // Minimum amount check (1 PHP based on requirements)
    if (!amount || parseFloat(amount) < 1) {
      setError('Amount must be at least ₱ 1.00')
      return
    }

    setLoading(true)
    setError('')

    try {
      const amountInCents = Math.round(parseFloat(amount) * 100).toString()

      console.log('[PayMongoInput] Creating payout...', {
        amount: amountInCents,
        ...search,
      })

      const payout = await createPayout({
        entityType: search.entityType || 'individual',
        entityValue: search.entityValue,
        value: amountInCents,
        currency: 'PHP',
        cryptoCurrency: 'USDC',
        cryptoChain: 'SOLANA',
        country: 'PH',
        remark: search.merchantName || 'PayMongo Scan Pay',
        qrString: search.qrString,
        purpose: search.purpose || 'PERSONAL_REMITTANCE',
        accountType: search.accountType,
      })

      if (!payout.data) {
        throw new Error('Failed to create payout')
      }

      navigate({
        to: `/wallet/pay/paymongo/${payout.data.id}`,
      })
    } catch (err) {
      console.error('Create payout error:', err)
      if (err instanceof PayoutAPIError) {
        setError(`Failed to create payout: ${err.message}`)
      } else {
        setError('Failed to create payout')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate({ to: '/wallet/scan' })
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0E17] text-white">
      {/* Header */}
      <div className="flex items-center p-4">
        <button
          onClick={handleBack}
          className="text-lg text-white hover:text-gray-300"
        >
          Back
        </button>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold">Enter Amount</h1>
        </div>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 px-6 pt-6">
        {/* Pay To Info */}
        <div className="mb-8 rounded-2xl bg-gray-800 p-6">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-2xl">🇵🇭</span>
            <span className="text-sm text-gray-400">Pay To (Philippines)</span>
          </div>
          <div className="text-xl font-bold break-all text-blue-400">
            {search.merchantName || search.entityValue}
          </div>
          {search.merchantName &&
            search.merchantName !== search.entityValue && (
              <div className="mt-2 text-sm text-gray-400">
                Account: {search.entityValue}
              </div>
            )}
        </div>

        {/* Amount Input */}
        <div className="space-y-4">
          <div className="text-sm text-gray-400">Amount (Philippine Peso)</div>
          <div className="rounded-2xl bg-gray-800 p-6">
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-purple-400">₱</span>
              <input
                type="number"
                placeholder="0.00"
                className="w-full bg-transparent text-right text-4xl font-light text-white outline-none placeholder:text-gray-600"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.01"
                min="1"
                autoFocus
              />
            </div>
          </div>

          {/* USDC Estimate Display - like upnetwork-v2 */}
          <div className="rounded-2xl bg-gray-800/50 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500">
                  <span className="text-xs font-bold text-white">$</span>
                </div>
                <span className="text-gray-300">USDC</span>
              </div>
              <span className="text-2xl font-light text-white">
                {rateLoading ? (
                  <span className="text-gray-500">Loading...</span>
                ) : (
                  estimatedUSDC
                )}
              </span>
            </div>
          </div>

          {/* Exchange Rate Info */}
          <p className="text-center text-sm text-gray-500">
            1 PHP ≈ {formatExchangeRate()} USDC
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-900/50 p-4 text-center text-red-200">
            {error}
          </div>
        )}

        <button
          onClick={handleContinue}
          disabled={loading || !amount || parseFloat(amount) < 1}
          className="mt-8 w-full rounded-full bg-purple-500 py-4 text-lg font-bold text-white transition hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500"
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
              Creating Order...
            </span>
          ) : (
            'Continue'
          )}
        </button>
      </div>
    </div>
  )
}
