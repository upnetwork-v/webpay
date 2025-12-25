import { createPayout, PayoutAPIError } from '@/api/payout'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

interface PayNowInputSearchParams {
  proxyType: string
  proxyValue: string
  merchantName?: string
  qrString?: string
}

export const Route = createFileRoute('/wallet/pay/paynow/')({
  component: PayNowInputPage,
  validateSearch: (
    search: Record<string, unknown>
  ): PayNowInputSearchParams => {
    return {
      proxyType: (search.proxyType as string) || '',
      proxyValue: (search.proxyValue as string) || '',
      merchantName: search.merchantName as string | undefined,
      qrString: search.qrString as string | undefined,
    }
  },
})

function PayNowInputPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleContinue = async () => {
    if (!amount || parseFloat(amount) < 0.01) {
      setError('Amount must be at least S$ 0.01')
      return
    }

    setLoading(true)
    setError('')

    try {
      const amountInCents = Math.round(parseFloat(amount) * 100).toString()
      const entityType = 'company' // Fixed to 'company' to match upnetwork-v2

      console.log('[PayNowInput] Creating payout...', {
        amount: amountInCents,
        ...search,
      })

      const payout = await createPayout({
        entityType,
        entityValue: search.proxyValue,
        value: amountInCents,
        currency: 'SGD',
        cryptoCurrency: 'USDC',
        cryptoChain: 'SOLANA',
        country: 'SG',
        remark: search.merchantName,
        qrString: search.qrString,
      })

      if (!payout.data) {
        throw new Error('Failed to create payout')
      }

      // Keep using the unified dynamic route
      navigate({
        to: `/wallet/pay/paynow/${payout.data.id}`,
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

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0E17] text-white">
      {/* Header */}
      <div className="flex items-center p-4">
        <button
          onClick={() => navigate({ to: '/wallet/scan' })}
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
          <div className="mb-2 text-sm text-gray-400">Pay To</div>
          <div className="text-xl font-bold break-all text-blue-400">
            {search.proxyValue}
          </div>
          {search.merchantName && (
            <div className="mt-2 text-sm text-white">{search.merchantName}</div>
          )}
        </div>

        {/* Amount Input */}
        <div className="space-y-4">
          <div className="text-sm text-gray-400">Amount (SGD)</div>
          <div className="rounded-2xl bg-gray-800 p-6">
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold">SGD</span>
              <input
                type="number"
                placeholder="0.00"
                className="w-full bg-transparent text-right text-4xl font-light text-white outline-none"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.01"
                min="0.01"
                autoFocus
              />
            </div>
          </div>

          <div className="text-right text-sm text-gray-400">
            ≈ {(parseFloat(amount || '0') * 0.7794).toFixed(6)} USDC
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-900/50 p-4 text-center text-red-200">
            {error}
          </div>
        )}

        <button
          onClick={handleContinue}
          disabled={loading || !amount || parseFloat(amount) < 0.01}
          className="mt-8 w-full rounded-full bg-purple-500 py-4 text-lg font-bold text-white transition hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500"
        >
          {loading ? 'Creating Order...' : 'Next'}
        </button>
      </div>
    </div>
  )
}
