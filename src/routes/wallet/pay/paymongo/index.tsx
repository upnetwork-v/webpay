import { createPayout, PayoutAPIError } from '@/api/payout'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

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

function PayMongoInputPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  console.log('[PayMongoInputPage] search:', search)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleContinue = async () => {
    // Minimum amount check (assuming 1 PHP based on requirements)
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
            {search.merchantName || search.entityValue}
          </div>
          {search.merchantName &&
            search.merchantName !== search.entityValue && (
              <div className="mt-2 text-sm text-gray-400">
                {search.entityValue}
              </div>
            )}
        </div>

        {/* Amount Input */}
        <div className="space-y-4">
          <div className="text-sm text-gray-400">Amount (PHP)</div>
          <div className="rounded-2xl bg-gray-800 p-6">
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold">PHP</span>
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
          {loading ? 'Creating Order...' : 'Next'}
        </button>
      </div>
    </div>
  )
}
