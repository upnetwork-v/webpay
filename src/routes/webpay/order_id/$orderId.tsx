import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getOrderById, coinCalculatorQuery } from "@/api/order";
import type { Order, CoinCalculator } from "@/types";
import { useWallet } from "@/wallets/provider/useWallet";
import { getSolanaExplorerUrl } from "@/utils";
import Logo from "@/assets/img/logo.svg";
import { usePayment } from "@/hooks";
import OrderDetailCard from "@/components/orderDetailCard";
import CheckIcon from "@/assets/img/check.png";
import { TrustWalletConfirmationModal } from "@/components/TrustWalletConfirmationModal";
import { PaymentManager, type PaymentResult } from "@/utils/paymentManager";
import type { PaymentRequest } from "@/wallets/types/wallet";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

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

  // Trust Wallet Deep Link 确认弹窗状态
  const [showTrustConfirmation, setShowTrustConfirmation] =
    useState<boolean>(false);
  const [pendingPaymentRequest, setPendingPaymentRequest] =
    useState<PaymentRequest | null>(null);

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
    if (!isConnected) {
      console.log("handlePay not connected", isConnected);
      await handleConnectWallet();
      return;
    }

    if (state.walletType !== "trust" && !publicKey) {
      console.log("publicKey not found", publicKey);
      await handleConnectWallet();
      return;
    }

    if (!order) {
      setError(`Order not found`);
      return;
    }

    try {
      setIsLoading(true);

      // 构建支付请求
      const paymentRequest: PaymentRequest = {
        recipientAddress: order.merchantSolanaAddress,
        amount: coinCalculator?.payTokenAmount || "0",
        decimal:
          paymentToken?.decimal || LAMPORTS_PER_SOL.toString().length - 1,
        tokenMint: paymentToken?.isNative
          ? undefined
          : paymentToken?.tokenAddress,
        orderId: order.orderId,
      };

      // 使用支付管理器处理不同钱包类型的支付
      const paymentResult: PaymentResult = await PaymentManager.processPayment(
        state.walletType!,
        signAndSendTransaction,
        paymentRequest
      );

      if (paymentResult.success && paymentResult.transactionHash) {
        // 支付成功
        setTransactionSignature(paymentResult.transactionHash);
        setIsComplete(true);
        setIsLoading(false);
      } else if (paymentResult.needsConfirmation) {
        // Trust Wallet Deep Link 需要用户确认
        setPendingPaymentRequest(paymentRequest);
        setShowTrustConfirmation(true);
        setIsLoading(false);
      } else {
        // 支付失败
        setError(paymentResult.error || "Payment failed");
        setIsLoading(false);
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

  // Trust Wallet 确认处理函数
  const handleTrustWalletConfirm = useCallback(async () => {
    if (!pendingPaymentRequest) return;

    // 模拟支付成功（实际场景中可能需要调用后端验证）
    // 这里我们假设用户确认就意味着支付成功
    console.log("[Trust Wallet] User confirmed payment completion");

    // 生成一个模拟的交易签名（实际场景中应该从后端获取）
    const mockTransactionSignature = `trust_payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    setTransactionSignature(mockTransactionSignature);
    setIsComplete(true);
    setShowTrustConfirmation(false);
    setPendingPaymentRequest(null);
  }, [pendingPaymentRequest]);

  const handleTrustWalletCancel = useCallback(() => {
    console.log("[Trust Wallet] User cancelled payment");
    setShowTrustConfirmation(false);
    setPendingPaymentRequest(null);
    setError("Payment cancelled by user");
  }, [setError]);

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

      {/* Trust Wallet 确认弹窗 */}
      <TrustWalletConfirmationModal
        isOpen={showTrustConfirmation}
        onClose={() => setShowTrustConfirmation(false)}
        onConfirm={handleTrustWalletConfirm}
        onCancel={handleTrustWalletCancel}
        paymentRequest={pendingPaymentRequest}
        order={order}
      />
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
