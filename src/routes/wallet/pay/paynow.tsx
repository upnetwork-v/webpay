import { createPayout, PayoutAPIError } from '@/api/payout'
import { USDC_TOKEN_MINT } from '@/constants/token'
import type { PayNowQRData, PayoutData } from '@/types/payout'
import { createSPLTransferTransaction } from '@/utils/transaction'
import { useWallet } from '@/wallets/provider/useWallet'
import { Connection, PublicKey } from '@solana/web3.js'
import {
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

// Define the expected location state type
interface PayNowLocationState {
  payNowData?: PayNowQRData
}

type PaymentStep = 'input' | 'preview' | 'paying' | 'verifying'

export const Route = createFileRoute('/wallet/pay/paynow')({
  component: PayNowPaymentComponent,
})

function PayNowPaymentComponent() {
  const navigate = useNavigate()
  const location = useLocation()
  const { adapter, state } = useWallet()

  // Extract wallet address and create connection
  const walletAddress = state.publicKey
  const wallet = adapter
  const connection = useMemo(
    () => new Connection(import.meta.env.VITE_SOLANA_RPC),
    []
  )

  // Access the state with proper typing
  const { payNowData } = (location.state as PayNowLocationState) || {}

  // Payment flow state
  const [step, setStep] = useState<PaymentStep>('input')
  const [amount, setAmount] = useState<string>(payNowData?.amount || '')
  const [payoutData, setPayoutData] = useState<PayoutData | null>(null)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // If no payment data, redirect back to wallet
    if (!payNowData) {
      navigate({ to: '/wallet' })
    }
  }, [payNowData, navigate])

  if (!payNowData) {
    return null
  }

  const handleCancel = () => {
    navigate({ to: '/wallet' })
  }

  const handleContinue = async () => {
    setError('')
    setLoading(true)

    try {
      // Validate amount
      const amountNum = parseFloat(amount)
      if (isNaN(amountNum) || amountNum < 0.01) {
        setError('金额必须大于等于 0.01 SGD')
        setLoading(false)
        return
      }

      // Convert SGD to cents
      const amountInCents = Math.round(amountNum * 100).toString()

      // Determine entity type based on proxy type
      const entityType =
        payNowData.proxyType === 'uen' ? 'company' : 'individual'

      // Call createPayout API
      const response = await createPayout({
        entityType,
        entityValue: payNowData.proxyValue,
        value: amountInCents,
        currency: 'SGD',
        cryptoCurrency: 'USDC',
        cryptoChain: 'SOLANA',
        country: 'SG',
        remark: payNowData.merchantName,
        qrString: JSON.stringify(payNowData.rawData),
      })

      if (!response.data) {
        throw new Error('Failed to create payout order')
      }

      setPayoutData(response.data)
      setStep('preview')
    } catch (err) {
      console.error('Create payout error:', err)
      if (err instanceof PayoutAPIError) {
        setError(err.message)
      } else {
        setError('创建支付订单失败，请重试')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmPayment = async () => {
    if (!payoutData || !walletAddress || !wallet || !connection) {
      setError('钱包未连接')
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
        from: walletAddress,
        to: new PublicKey(payoutData.paymentAddress),
        tokenAmount: usdcAmount.toString(),
        tokenAddress: new PublicKey(USDC_TOKEN_MINT),
        orderId: payoutData.id,
      })

      // Sign and send transaction
      const signedTx = await wallet.signTransaction(transaction)
      const signature = await connection.sendRawTransaction(
        signedTx.serialize()
      )

      console.log('Transaction sent:', signature)

      // Wait for confirmation
      setStep('verifying')
      await connection.confirmTransaction(signature, 'confirmed')

      // Navigate to result page or show success
      // For now, just show success message
      alert('支付成功！')
      navigate({ to: '/wallet' })
    } catch (err) {
      console.error('Payment error:', err)
      setError('支付失败: ' + (err instanceof Error ? err.message : '未知错误'))
      setStep('preview')
    } finally {
      setLoading(false)
    }
  }

  const isAmountEditable = !payNowData.amount

  return (
    <div className="bg-base-200 flex min-h-screen flex-col">
      {/* Header */}
      <div className="navbar bg-base-100 shadow-sm">
        <div className="flex-1">
          <h1 className="text-xl font-bold">PayNow 支付</h1>
        </div>
        <button className="btn btn-ghost" onClick={handleCancel}>
          取消
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center p-4">
        <div className="card bg-base-100 w-full max-w-lg shadow-xl">
          <div className="card-body">
            {/* Step 1: Input/Confirm Amount */}
            {step === 'input' && (
              <>
                <h2 className="card-title mb-4">确认支付信息</h2>

                {/* Recipient Info */}
                <div className="space-y-4">
                  {payNowData.merchantName && (
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text">商户名称</span>
                      </label>
                      <div className="text-lg font-semibold">
                        {payNowData.merchantName}
                      </div>
                    </div>
                  )}

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">收款方式</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="badge badge-primary">
                        {payNowData.proxyType === 'phone' && '手机号'}
                        {payNowData.proxyType === 'uen' && 'UEN'}
                        {payNowData.proxyType === 'nric' && 'NRIC'}
                        {payNowData.proxyType === 'unknown' && '未知'}
                      </span>
                      <span className="font-mono text-sm">
                        {payNowData.proxyValue}
                      </span>
                    </div>
                  </div>

                  {/* Amount Input/Display */}
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">支付金额</span>
                    </label>
                    {isAmountEditable ? (
                      <div className="input-group">
                        <input
                          type="number"
                          placeholder="0.00"
                          className="input input-bordered w-full"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          step="0.01"
                          min="0.01"
                        />
                        <span className="bg-base-200 px-4">SGD</span>
                      </div>
                    ) : (
                      <div className="text-3xl font-bold">SGD {amount}</div>
                    )}
                  </div>

                  {/* Reference */}
                  {payNowData.referenceId && (
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text">参考编号</span>
                      </label>
                      <div className="text-sm">{payNowData.referenceId}</div>
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div className="alert alert-error mt-4">
                    <span>{error}</span>
                  </div>
                )}

                {/* Continue Button */}
                <div className="card-actions mt-6 justify-end">
                  <button
                    className={`btn btn-primary ${loading ? 'loading' : ''}`}
                    onClick={handleContinue}
                    disabled={loading || !amount || parseFloat(amount) < 0.01}
                  >
                    {loading ? '处理中...' : '继续'}
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Preview Payment Details */}
            {step === 'preview' && payoutData && (
              <>
                <h2 className="card-title mb-4">确认支付详情</h2>

                <div className="space-y-4">
                  {/* Fiat Amount */}
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">支付金额</span>
                    </label>
                    <div className="text-2xl font-bold">
                      {payoutData.fiatCurrency}{' '}
                      {(payoutData.fiatAmount / 100).toFixed(2)}
                    </div>
                  </div>

                  {/* Exchange Rate */}
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">汇率</span>
                    </label>
                    <div className="text-lg">
                      1 USDC = {payoutData.exchangeRate} SGD
                    </div>
                  </div>

                  {/* Crypto Amount */}
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">需支付</span>
                    </label>
                    <div className="text-primary text-2xl font-bold">
                      {(
                        Number(payoutData.cryptoAmount) /
                        Math.pow(10, payoutData.cryptoDecimal)
                      ).toFixed(payoutData.cryptoDecimal)}{' '}
                      {payoutData.cryptoCurrency}
                    </div>
                  </div>

                  {/* Recipient Address */}
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">收款地址</span>
                    </label>
                    <div className="font-mono text-xs break-all">
                      {payoutData.paymentAddress.slice(0, 8)}...
                      {payoutData.paymentAddress.slice(-8)}
                    </div>
                  </div>

                  {/* Expiry Countdown */}
                  <div className="alert alert-warning">
                    <span className="text-sm">订单将在 5 分钟后过期</span>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="alert alert-error mt-4">
                    <span>{error}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="card-actions mt-6 justify-between">
                  <button
                    className="btn btn-ghost"
                    onClick={() => setStep('input')}
                    disabled={loading}
                  >
                    返回
                  </button>
                  <button
                    className={`btn btn-primary ${loading ? 'loading' : ''}`}
                    onClick={handleConfirmPayment}
                    disabled={loading}
                  >
                    {loading ? '处理中...' : '确认支付'}
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Paying */}
            {step === 'paying' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="loading loading-spinner loading-lg"></div>
                <p className="text-lg">正在签名交易...</p>
                <p className="text-sm text-gray-500">请在钱包中确认</p>
              </div>
            )}

            {/* Step 4: Verifying */}
            {step === 'verifying' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="loading loading-spinner loading-lg"></div>
                <p className="text-lg">交易确认中...</p>
                <p className="text-sm text-gray-500">请稍候，正在验证支付</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
