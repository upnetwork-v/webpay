import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getOrderById, coinCalculatorQuery } from "@/api/order";
import type { Order, CoinCalculator } from "@/types";
import { useWallet } from "@/wallets/provider/useWallet";
import { getSolanaExplorerUrl, isValidSolanaTxHash } from "@/utils";
import Logo from "@/assets/img/logo.svg";
import { usePayment } from "@/hooks";
import OrderDetailCard from "@/components/orderDetailCard";
import CheckIcon from "@/assets/img/check.png";

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

  const {
    state,
    signAndSendTransaction,
    handleConnectCallback,
    handlePaymentCallback,
    openWalletSelector,
  } = useWallet();
  const { isConnected, publicKey } = state;

  // Get payment token
  const paymentToken = useMemo(() => {
    if (!order) return null;
    return (
      order.supportTokenList.find(
        (token) =>
          token.symbol ===
          (order.paymentStatus === "success"
            ? order.paymentResult?.symbol
            : order.defaultPaymentToken)
      ) || null
    );
  }, [order]);

  // Initialize payment logic
  const { error, setError } = usePayment({
    order: order,
    paymentToken: paymentToken,
    coinCalculator: coinCalculator,
    phantomPublicKey: publicKey,
  });

  // Transaction fee estimation - now handled by adapters internally
  useEffect(() => {
    if (order && coinCalculator) {
      // For display purposes, we can show a typical SOL transaction fee
      setIsEstimatingFee(true);
      // Simulate fee estimation
      setTimeout(() => {
        setIsEstimatingFee(false);
        setEstimatedFee("0.000005"); // Typical SOL transaction fee
      }, 500);
    }
  }, [order, coinCalculator, setIsEstimatingFee, setEstimatedFee]);

  // Check for Phantom connection callback or payment response when component mounts
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const phantomPk = urlParams.get("phantom_encryption_public_key");
    const nonce = urlParams.get("nonce");
    const data = urlParams.get("data");
    const errorCode = urlParams.get("errorCode");

    // Handle connection callback
    if (phantomPk && nonce && data) {
      const processConnectCallback = async () => {
        const result = await handleConnectCallback({
          phantom_encryption_public_key: phantomPk,
          nonce: nonce,
          data: data,
        });
        if (result.success && result.type === "connect") {
          // 清除 URL 参数
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } else if (!result.success) {
          setError(result.error || "Connection failed");
        }
      };
      processConnectCallback();
    }
    // Handle payment response
    else if (nonce && data) {
      const processPaymentResponse = async () => {
        try {
          console.log("Processing payment response from Phantom...");

          // 通过 useWallet 暴露的 handlePaymentCallback 统一处理回调
          const result = await handlePaymentCallback({
            nonce: nonce,
            data: data,
          });
          if (result.success && result.type === "signAndSendTransaction") {
            if (
              typeof result.data === "object" &&
              result.data !== null &&
              "signature" in result.data &&
              typeof (result.data as { signature?: unknown }).signature ===
                "string"
            ) {
              setTransactionSignature(
                (result.data as { signature: string }).signature
              );
              setIsComplete(true);
            } else {
              setError("Payment response missing signature");
            }
          } else if (!result.success) {
            setError(result.error || "Payment failed");
          }

          // Clean up the URL
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (err) {
          console.error("Error processing payment response:", err);
          setError(`Failed to process payment response: ${err}`);
        }
      };

      if (publicKey) {
        processPaymentResponse();
      } else {
        setError("Wallet not connected");
      }
    }
    // Handle payment errors
    else if (errorCode) {
      const errorMessage =
        urlParams.get("errorMessage") || "Payment was cancelled or failed";
      console.error("Payment error:", { errorCode, errorMessage });
      setError(`Payment failed: ${errorCode} ${errorMessage}`);

      // Clean up the URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [
    orderId,
    handleConnectCallback,
    publicKey,
    setError,
    handlePaymentCallback,
  ]);

  // Connect to Phantom wallet
  const handleConnectWallet = useCallback(() => {
    openWalletSelector();
  }, [openWalletSelector]);

  // Fetch order details
  useEffect(() => {
    if (orderId) {
      setIsLoading(true);
      getOrderById(orderId)
        .then(setOrder)
        .catch((err) => {
          console.error("Error fetching order:", err);
          setError(`Failed to load order details: ${err}`);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [orderId, setError]);

  //
  useEffect(() => {
    if (order) {
      if (!order.merchantSolanaAddress) {
        setError("Merchant Solana address not found");
        return;
      }

      if (order.paymentStatus === "success") {
        console.log("order already paid", order);
        setIsComplete(true);
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
          console.error("Error fetching Calculator:", err);
          setError(`Failed to Calculator: ${err}`);
        });
    }
  }, [order, setError, paymentToken]);

  // Handle payment
  const handlePay = useCallback(async () => {
    if (isLoading) {
      return;
    }
    // Skip tx validation as we build transactions dynamically now
    if (!isConnected || !publicKey) {
      console.log("handlePay not connected", isConnected, publicKey);
      await handleConnectWallet();
      return;
    }

    if (!order) {
      setError(`Order not found`);
      return;
    }

    try {
      setIsLoading(true);

      // Transaction will be built dynamically by the adapter

      // 构建支付请求
      const paymentRequest = {
        recipientAddress: order.merchantSolanaAddress,
        amount: coinCalculator?.payTokenAmount || "0",
        tokenMint: paymentToken?.isNative
          ? undefined
          : paymentToken?.tokenAddress,
        orderId: order.orderId,
      };

      // 使用新的支付请求接口
      const result = await signAndSendTransaction(paymentRequest);
      // okx wallet return tx hash
      console.log("signAndSendTransaction result", result);
      // 如果是 okx 钱包，而且 result 是否是合法的 Solana tx hash，则认为支付成功
      if (state.walletType === "okx") {
        if (isValidSolanaTxHash(result)) {
          setTransactionSignature(result);
          setIsComplete(true);
        } else {
          console.error("Invalid tx hash", result);
          setError("Payment failed");
        }
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Payment failed";
      setError(errorMessage);
      setIsLoading(false);
    }
  }, [
    isConnected,
    publicKey,
    order,
    handleConnectWallet,
    signAndSendTransaction,
    setError,
    isLoading,
    state.walletType,
    paymentToken,
    coinCalculator,
  ]);

  // confirm order
  const orderConfirmed = useMemo(() => {
    if (!order) return false;
    return order.paymentStatus === "success";
  }, [order]);

  const requestTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any existing timeout when dependencies change
    if (requestTimeout.current) {
      clearTimeout(requestTimeout.current);
    }

    // Only start polling if we have all required conditions
    if (orderId && isComplete && transactionSignature && !orderConfirmed) {
      const pollOrder = () => {
        getOrderById(orderId).then((res) => {
          console.log("polling order", res);
          setOrder(res);
        });
      };

      // Initial request
      pollOrder();

      // Set up polling interval
      requestTimeout.current = setInterval(pollOrder, 6000);
    }

    // Cleanup function
    return () => {
      if (requestTimeout.current) {
        clearInterval(requestTimeout.current);
        requestTimeout.current = null;
      }
    };
  }, [isComplete, transactionSignature, orderConfirmed, orderId]);

  // Render error state
  if (error) {
    return (
      <div className="min-h-screen bg-base-200 hero">
        <div className="text-center hero-content">
          <div className="max-w-md">
            <h1 className="font-bold text-5xl">Error</h1>

            <p className="py-6">{error}</p>

            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const MainButtonClass =
    "bg-gradient-to-b from-white rounded-full to-neutral-200 border-[0] text-neutral btn btn-primary btn-block btn-lg";

  // Render payment form
  return (
    <div className="flex h-full bg-base-300 w-full justify-center items-center">
      <div
        className={
          "h-full max-w-md bg-base-300 w-full py-4 px-8 pb-24 overflow-hidden shadow-md relative md:rounded-xl md:h-auto "
        }
      >
        {orderConfirmed && <div className="paid-bg-gradient"></div>}
        <div className="flex flex-col my-10 text-center gap-y-4">
          <img src={Logo} alt="Onta pay" className="mx-auto h-6" />
          {orderConfirmed ? (
            <div className="flex gap-2 items-center justify-center">
              <img src={CheckIcon} alt="Check" className="h-5" />
              Order paid
            </div>
          ) : (
            <div className="text-base-content">Pay order with crypto</div>
          )}
        </div>

        {/* 订单详情 */}
        <OrderDetailCard
          order={order}
          paymentToken={paymentToken}
          coinCalculator={coinCalculator}
          isEstimatingFee={isEstimatingFee}
          estimatedFee={estimatedFee}
          backgroundColor={orderConfirmed ? "bg-success" : undefined}
          isLoading={isLoading}
        />

        {/* 按钮 */}
        {!orderConfirmed && (
          <div className="py-4 px-8 right-0 bottom-2 left-0 absolute">
            <div className="mx-auto max-w-md px-1">
              {!isConnected ? (
                <button
                  className={MainButtonClass}
                  disabled={state.isLoading}
                  onClick={handleConnectWallet}
                >
                  {state.isLoading ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : null}
                  Connect Wallet
                </button>
              ) : isComplete && transactionSignature ? (
                <>
                  <div className="text-xs text-base-content text-center p-4">
                    Pay Success!{" "}
                    <a
                      href={getSolanaExplorerUrl(transactionSignature)}
                      target="_blank"
                      className="link link-primary"
                    >
                      View on Solana Explorer
                    </a>
                    .
                  </div>
                  <button className={MainButtonClass} disabled>
                    <span className="loading loading-spinner loading-xs"></span>
                    Confirming transaction...
                  </button>
                </>
              ) : (
                <button
                  className={MainButtonClass}
                  disabled={state.isLoading}
                  onClick={handlePay}
                >
                  {state.isLoading ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : null}
                  Pay Now
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/webpay/order_id/$orderId")({
  component: PaymentPage,
  validateSearch: (search: Record<string, unknown>): { orderId: string } => {
    return {
      orderId: search.order_id as string,
    };
  },
});
