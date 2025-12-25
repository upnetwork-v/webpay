import Logo from '@/assets/img/Vector.png'
import SolanaLogo from '@/assets/img/solana-logo.png'
import type { Order, PreferredRoute } from '@/types'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import React from 'react'
import { formatUnits } from 'viem'

interface OrderDetailCardProps {
  order: Order | null
  preferredRoute: PreferredRoute | null
  isEstimatingFee: boolean
  estimatedFee: string
  isLoading?: boolean
}

const CardSplitter = () => {
  return (
    <div className="relative -mx-7 my-4 h-6">
      <div className="border-base-content/10 absolute top-3 right-8 left-8 h-[0px] border-t border-dashed"></div>
      {/* <div
        className={`rounded-full ${backgroundColor || "bg-base-300"} h-6 top-0 left-0 w-6 absolute`}
      ></div>
      <div
        className={`rounded-full ${backgroundColor || "bg-base-300"} h-6 top-0 right-0 w-6 absolute`}
      ></div> */}
    </div>
  )
}

const OrderDetailCard: React.FC<OrderDetailCardProps> = ({
  order,
  preferredRoute,
  isEstimatingFee,
  estimatedFee,
}) => {
  if (order) {
    return (
      <div className="bg-base-200 relative z-10 my-4 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          {/* 头像 placeholder */}
          <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-300 text-2xl">
            {order.merchantName?.[0] || 'S'}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="text-xs text-gray-400">Place</div>
            <div className="overflow-hidden text-lg font-semibold text-ellipsis whitespace-nowrap">
              {order.merchantName}
            </div>
          </div>
        </div>

        <CardSplitter />

        <div className="space-y-2">
          <div className="flex items-center">
            <span className="text-neutral-content">Pay</span>
            <span className="text-base-content flex-1 overflow-hidden text-right text-ellipsis">
              {order.fiatAmount} {order.currency}
            </span>
          </div>
          {/* <div className="flex items-center">
            <span className="text-neutral-content">Payment Token</span>
            <span className="flex-1 text-base-content text-ellipsis text-right overflow-hidden">
              {paymentToken?.symbol}
            </span>
          </div> */}

          {preferredRoute && (
            <div className="flex items-center">
              <span className="text-neutral-content">In Crypto</span>
              <span className="text-base-content flex-1 overflow-hidden text-right text-ellipsis">
                {order.status === 2 ? (
                  `${formatUnits(
                    BigInt(preferredRoute.tokenAmount || '0'),
                    preferredRoute.tokenDecimals || 0
                  )} ${preferredRoute.tokenSymbol}`
                ) : (
                  <>
                    {formatUnits(
                      BigInt(preferredRoute.tokenAmount || '0'),
                      preferredRoute.tokenDecimals || 0
                    )}{' '}
                    {preferredRoute.tokenSymbol}
                  </>
                )}
              </span>
            </div>
          )}

          <div className="flex items-center">
            <span className="text-neutral-content">Fees</span>
            <span className="text-base-content flex-1 overflow-hidden text-right text-ellipsis">
              {order.status === 2 ? (
                <div>
                  {Number(order.tx?.gasFee || '0') / LAMPORTS_PER_SOL} SOL
                </div>
              ) : isEstimatingFee ? (
                <div className="loading loading-spinner loading-xs"></div>
              ) : (
                `${estimatedFee} SOL`
              )}
            </span>
          </div>

          {/* <div className="flex items-center">
            <span className="text-neutral-content">Total</span>
            <div className="font-semibold flex-1 text-white text-right">
              {order.status === 2 ? (
                <>
                  {formatUnits(
                    BigInt(order.paymentResult?.amount || "0"),
                    paymentToken?.decimal || 0
                  )}{" "}
                  {order.paymentResult?.symbol}
                </>
              ) : (
                <>
                  ≈{" "}
                  {!coinCalculator ? (
                    <div className="loading loading-spinner loading-xs"></div>
                  ) : (
                    `${coinCalculator.payTokenAmount} ${coinCalculator.payTokenSymbol}`
                  )}
                </>
              )}
            </div>
          </div> */}

          <div className="flex items-center">
            <span className="text-neutral-content">Chain</span>
            <div className="text-base-content flex-1 overflow-hidden text-right text-ellipsis">
              <img
                src={SolanaLogo}
                alt="solana"
                className="mx-1 inline-block h-8 w-8"
              />
              Solana
            </div>
          </div>

          {/* {!paymentToken?.isNative && (
            <div className="text-xs text-right text-gray-400">
              * Network fee will be paid in SOL
            </div>
          )} */}
        </div>

        <CardSplitter />

        <div className="relative flex flex-col gap-2 text-left opacity-40">
          {/* logo */}
          <img
            src={Logo}
            alt="logo"
            className="absolute right-2 bottom-4 w-10"
          />

          <div className="flex flex-col gap-y-1">
            <div className="text-base-content text-xs">Order ID</div>
            <div className="text-base-content text-sm">{order.id}</div>
          </div>

          <div className="flex flex-col gap-y-1">
            <div className="text-base-content text-xs">Order Time</div>
            <div className="text-base-content text-sm">
              {new Date(order.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    )
  } else {
    return (
      <div className="bg-base-100 my-4 rounded-2xl p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="skeleton h-10 w-10 rounded"></div>
            <div className="flex-1">
              <div className="skeleton mb-1 h-3 w-16"></div>
              <div className="skeleton h-4 w-32"></div>
            </div>
          </div>
          <div className="skeleton h-4 w-full"></div>
          <div className="skeleton h-4 w-full"></div>
          <div className="skeleton h-4 w-full"></div>
          <div className="skeleton h-4 w-full"></div>
          <div className="skeleton ml-auto h-6 w-1/2"></div>
          <div className="skeleton ml-auto h-3 w-32"></div>
          <div className="skeleton h-3 w-40"></div>
        </div>
      </div>
    )
  }
}

export default OrderDetailCard
