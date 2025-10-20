import type { Order, CoinCalculator, Token } from "@/types";
import React from "react";
import Logo from "@/assets/img/Vector.png";
import SolanaLogo from "@/assets/img/solana-logo.png";
import { formatUnits } from "viem";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

interface OrderDetailCardProps {
  order: Order | null;
  paymentToken: Token | null;
  coinCalculator: CoinCalculator | null;
  isEstimatingFee: boolean;
  estimatedFee: string;
  isLoading?: boolean;
}

const CardSplitter = () => {
  return (
    <div className="h-6 my-4 -mx-7 relative">
      <div className="border-t border-dashed border-base-content/10 h-[0px] top-3 right-8 left-8 absolute"></div>
      {/* <div
        className={`rounded-full ${backgroundColor || "bg-base-300"} h-6 top-0 left-0 w-6 absolute`}
      ></div>
      <div
        className={`rounded-full ${backgroundColor || "bg-base-300"} h-6 top-0 right-0 w-6 absolute`}
      ></div> */}
    </div>
  );
};

const OrderDetailCard: React.FC<OrderDetailCardProps> = ({
  order,
  paymentToken,
  coinCalculator,
  isEstimatingFee,
  estimatedFee,
}) => {
  if (order) {
    return (
      <div className="bg-base-200 rounded-2xl my-4 p-4 z-10 relative">
        <div className="flex gap-2 items-center">
          {/* 头像 placeholder */}
          <div className="rounded flex bg-gray-300 h-10 text-2xl w-10 items-center justify-center">
            {order.merchantName?.[0] || "S"}
          </div>
          <div className="flex-1 overflow-hidden">
            <div className="text-xs text-gray-400">Place</div>
            <div className="font-semibold text-lg text-ellipsis overflow-hidden whitespace-nowrap">
              {order.merchantName}
            </div>
          </div>
        </div>

        <CardSplitter />

        <div className="space-y-2">
          <div className="flex items-center">
            <span className="text-neutral-content">Pay</span>
            <span className="flex-1 text-base-content text-ellipsis text-right overflow-hidden">
              {(Number(order.orderValue) / 100).toFixed(2)} {order.currency}
            </span>
          </div>
          {/* <div className="flex items-center">
            <span className="text-neutral-content">Payment Token</span>
            <span className="flex-1 text-base-content text-ellipsis text-right overflow-hidden">
              {paymentToken?.symbol}
            </span>
          </div> */}

          <div className="flex items-center">
            <span className="text-neutral-content">In Crypto</span>
            <span className="flex-1 text-base-content text-ellipsis text-right overflow-hidden">
              {order.paymentStatus === "success" ? (
                `${formatUnits(
                  BigInt(order.paymentResult?.amount || "0"),
                  paymentToken?.decimal || 0
                )} ${order.paymentResult?.symbol}`
              ) : (
                <>
                  {!coinCalculator && (
                    <div className="loading loading-spinner loading-xs"></div>
                  )}
                  {formatUnits(
                    BigInt(coinCalculator?.payTokenAmount || "0"),
                    coinCalculator?.payTokenDecimal || 0
                  )}{" "}
                  {coinCalculator?.payTokenSymbol}
                </>
              )}
            </span>
          </div>

          <div className="flex items-center">
            <span className="text-neutral-content">Fees</span>
            <span className="flex-1 text-base-content text-ellipsis text-right overflow-hidden">
              {order.paymentStatus === "success" ? (
                <div>
                  {Number(order.paymentResult?.gasFee || 0) / LAMPORTS_PER_SOL}{" "}
                  SOL
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
              {order.paymentStatus === "success" ? (
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
            <div className="flex-1 text-base-content text-ellipsis text-right overflow-hidden">
              <img
                src={SolanaLogo}
                alt="solana"
                className="h-8 mx-1 w-8 inline-block"
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

        <div className="flex flex-col opacity-40 gap-2 relative text-left">
          {/* logo */}
          <img
            src={Logo}
            alt="logo"
            className="right-2 bottom-4 w-10 absolute"
          />

          <div className="flex flex-col gap-y-1">
            <div className=" text-base-content text-xs ">Order ID</div>
            <div className="text-base-content text-sm">{order.orderId}</div>
          </div>

          <div className="flex flex-col gap-y-1">
            <div className="text-base-content text-xs">Order Time</div>
            <div className="text-base-content text-sm">
              {new Date(order.createTime).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    );
  } else {
    return (
      <div className="bg-base-100 rounded-2xl my-4 p-4">
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <div className="rounded h-10 w-10 skeleton"></div>
            <div className="flex-1">
              <div className="h-3 mb-1 w-16 skeleton"></div>
              <div className="h-4 w-32 skeleton"></div>
            </div>
          </div>
          <div className="h-4 w-full skeleton"></div>
          <div className="h-4 w-full skeleton"></div>
          <div className="h-4 w-full skeleton"></div>
          <div className="h-4 w-full skeleton"></div>
          <div className="ml-auto h-6 w-1/2 skeleton"></div>
          <div className="ml-auto h-3 w-32 skeleton"></div>
          <div className="h-3 w-40 skeleton"></div>
        </div>
      </div>
    );
  }
};

export default OrderDetailCard;
