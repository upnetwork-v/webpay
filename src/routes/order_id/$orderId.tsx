import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getOrderById, coinCalculatorQuery } from "@/api/order";
import type { Order, CoinCalculator } from "@/types/payment";
import { WalletSelector, useWallet, usePayment } from "@/wallets";
import Logo from "@/assets/img/upnetwork-logo.png";
import { getSolanaExplorerUrl } from "@/utils/phantom";
import { parseUnits } from "viem";

export default function PaymentPage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [coinCalculator, setCoinCalculator] = useState<CoinCalculator | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState<
    string | null
  >(null);
  const [estimatedFee, setEstimatedFee] = useState<string>("0");
  const [isEstimatingFee, setIsEstimatingFee] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 钱包 hook
  const { connected, connecting, publicKey, connect } = useWallet();

  // 支付 hook
  const {
    processing: paymentProcessing,
    error: paymentError,
    sendPayment,
  } = usePayment();

  // Get payment token
  const paymentToken = useMemo(() => {
    if (!order) return null;
    return (
      order.supportTokenList.find(
        (token) => token.symbol === order.defaultPaymentToken
      ) || null
    );
  }, [order]);

  // Fetch order details
  useEffect(() => {
    if (orderId) {
      setIsLoading(true);
      getOrderById(orderId)
        .then(setOrder)
        .catch((err) => {
          setError(`Failed to load order details: ${err}`);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [orderId]);

  // Get coin calculator
  useEffect(() => {
    if (order) {
      if (!order.merchantSolanaAddress) {
        setError("Merchant Solana address not found");
        return;
      }
      if (order.paymentStatus === "success") {
        setError("Order already paid");
        return;
      }
      if (order.paymentStatus === "faile") {
        setError("Order payment failed");
        return;
      }
      if (order.paymentStatus === "pending") {
        setError("Order payment pending");
        return;
      }
      coinCalculatorQuery({
        id: order.orderId,
        symbol: paymentToken?.symbol || "",
        tokenAddress: paymentToken?.tokenAddress,
      })
        .then(setCoinCalculator)
        .catch((err) => {
          setError(`Failed to Calculator: ${err}`);
        });
    }
  }, [order, paymentToken]);

  // Estimate transaction fee
  useEffect(() => {
    // 目前无链上 Transaction 对象，暂不估算手续费
    setEstimatedFee("0");
    setIsEstimatingFee(false);
  }, [coinCalculator]);

  // Handle payment
  const handlePay = useCallback(async () => {
    if (!connected || !publicKey) {
      try {
        await connect();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to connect wallet."
        );
      }
      return;
    }
    if (!order || !coinCalculator) {
      setError("Order or calculator not ready");
      return;
    }
    try {
      setIsLoading(true);
      // 发起支付
      const signature = await sendPayment({
        recipient: order.merchantSolanaAddress,
        amount: parseUnits(
          coinCalculator.payTokenAmount,
          coinCalculator.payTokenDecimal
        ),
        tokenAddress: paymentToken?.tokenAddress,
        memo: order.orderId,
      });
      setTransactionSignature(signature);
      setIsComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setIsLoading(false);
    }
  }, [
    connected,
    publicKey,
    connect,
    order,
    coinCalculator,
    sendPayment,
    paymentToken,
  ]);

  // Order confirmed
  const orderConfirmed = useMemo(() => {
    if (!order) return false;
    return order.paymentStatus === "success";
  }, [order]);

  const requestTimeout = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (requestTimeout.current) {
      clearTimeout(requestTimeout.current);
    }
    if (orderId && isComplete && transactionSignature && !orderConfirmed) {
      const pollOrder = () => {
        getOrderById(orderId).then((res) => {
          setOrder(res);
        });
      };
      pollOrder();
      requestTimeout.current = setInterval(pollOrder, 6000);
    }
    return () => {
      if (requestTimeout.current) {
        clearInterval(requestTimeout.current);
        requestTimeout.current = null;
      }
    };
  }, [isComplete, transactionSignature, orderConfirmed, orderId]);

  // Render error state
  const errorMsg =
    typeof error === "string"
      ? error
      : error &&
          typeof (error as unknown) === "object" &&
          "message" in (error as object)
        ? String((error as { message?: string }).message)
        : "";
  const paymentErrorMsg =
    typeof paymentError === "string"
      ? paymentError
      : paymentError &&
          typeof (paymentError as unknown) === "object" &&
          "message" in (paymentError as object)
        ? String((paymentError as { message?: string }).message)
        : "";
  if (errorMsg || paymentErrorMsg) {
    return (
      <div className="hero bg-base-200 min-h-screen">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-5xl font-bold">
              {order?.paymentStatus !== "success" ? "Error" : "Success"}
            </h1>
            <p className="py-6">{errorMsg || paymentErrorMsg}</p>
            {order?.paymentStatus !== "success" ? (
              <button
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                Try Again
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // Render payment form
  return (
    <div className="flex h-full bg-gray-50 w-full justify-center items-center">
      <div className="h-full max-w-md bg-base-100 shadow-md w-full p-4 pb-24 overflow-hidden relative md:rounded-xl md:h-auto">
        <div className="font-semibold my-6 text-center">Merchant Connect</div>
        <WalletSelector className="mb-4" />
        {order ? (
          <>
            <div className="font-semibold my-2 leading-tight text-3xl">
              {order.merchantName}
            </div>
            <div className="my-2 text-xs leading-tight">
              Order ID: {order.orderId}
            </div>

            {/* 订单详情 */}
            <div className=" rounded-lg bg-base-300 my-4 p-4">
              <div className="font-semibold text-white mb-4">
                Payment Details
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center">
                  <span className="text-neutral-content">Order Value</span>
                  <span className="flex-1 text-base-content text-ellipsis text-right overflow-hidden">
                    {(Number(order.orderValue) / 100).toFixed(2)}{" "}
                    {order.currency}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-neutral-content">Payment Token</span>
                  <span className="flex-1 text-base-content text-ellipsis text-right overflow-hidden">
                    {paymentToken?.symbol}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-neutral-content">Amount</span>
                  <span className="flex-1 text-base-content text-ellipsis text-right overflow-hidden">
                    {!coinCalculator && (
                      <div className="loading loading-spinner loading-xs"></div>
                    )}
                    {coinCalculator?.payTokenAmount}{" "}
                    {coinCalculator?.payTokenSymbol}
                  </span>
                </div>

                <div className="flex items-center">
                  <span className="text-neutral-content">Network Fee</span>
                  <span className="flex-1 text-base-content text-ellipsis text-right overflow-hidden">
                    {isEstimatingFee ? (
                      <div className="loading loading-spinner loading-xs"></div>
                    ) : (
                      `${estimatedFee} SOL`
                    )}
                  </span>
                </div>

                <div className="flex items-center">
                  <span className="font-semibold text-white text-lg">
                    Sub Total
                  </span>

                  <div className="font-semibold flex-1 text-white text-right">
                    ≈{" "}
                    {!coinCalculator ? (
                      <div className="loading loading-spinner loading-xs"></div>
                    ) : (
                      `${coinCalculator.payTokenAmount} ${coinCalculator.payTokenSymbol}`
                    )}
                  </div>
                </div>

                {!paymentToken?.isNative && (
                  <div className="text-xs text-gray-400 text-right">
                    * Network fee will be paid in SOL
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg bg-base-300 my-4 p-4">
            <div className="font-semibold text-white mb-4">Payment Details</div>
            {isLoading && (
              <div className="flex min-h-48 justify-center items-center">
                <div className="loading loading-spinner loading-lg"></div>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col text-center leading-none gap-3 py-6">
          <div className=" text-xs text-base-content">Powered by</div>
          <div className="flex justify-center">
            <img src={Logo} alt="Up Network" className="h-6" />
          </div>
        </div>

        {/* 支付按钮 */}
        <div className="p-4 right-0 bottom-2 left-0 absolute">
          {!connected ? (
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={() => connect()}
              disabled={connecting}
            >
              连接钱包
            </button>
          ) : isComplete && transactionSignature ? (
            <>
              <div className="text-xs text-base-content text-center p-4">
                支付成功！{" "}
                <a
                  href={
                    transactionSignature
                      ? getSolanaExplorerUrl(transactionSignature)
                      : "#"
                  }
                  target="_blank"
                  className="text-success hover:underline"
                >
                  查看区块链交易
                </a>
                。{orderConfirmed ? "订单已确认！" : "订单确认中..."}
              </div>
              {orderConfirmed ? (
                <button className="btn btn-success btn-block btn-lg">
                  订单已确认！
                </button>
              ) : (
                <button className="btn btn-primary btn-block btn-lg" disabled>
                  <span className="loading loading-spinner loading-xs"></span>
                  支付中...
                </button>
              )}
            </>
          ) : (
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={handlePay}
              disabled={paymentProcessing || !coinCalculator}
            >
              支付 {coinCalculator?.payTokenAmount}{" "}
              {coinCalculator?.payTokenSymbol}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/order_id/$orderId")({
  component: PaymentPage,
  validateSearch: (search: Record<string, unknown>): { orderId: string } => {
    return {
      orderId: search.order_id as string,
    };
  },
});
