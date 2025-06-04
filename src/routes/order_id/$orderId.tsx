import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getOrderById, coinCalculatorQuery } from "@/api/order";
import type { Order, CoinCalculator } from "@/types/payment";
import { useWallet } from "@/wallets/provider/useWallet";
import { getSolanaExplorerUrl } from "@/utils/phantom";
import { estimateTransactionFee } from "@/utils/feeEstimator";
import Logo from "@/assets/logo.svg";
import type { Transaction } from "@solana/web3.js";
import { usePayment } from "@/hooks/usePayment";

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
        (token) => token.symbol === order.defaultPaymentToken
      ) || null
    );
  }, [order]);

  // Initialize payment logic
  const { error, createPaymentTransaction, setError } = usePayment({
    order: order,
    paymentToken: paymentToken,
    coinCalculator: coinCalculator,
    phantomPublicKey: publicKey,
  });

  const [tx, setTx] = useState<Transaction | null>(null);

  useEffect(() => {
    if (!tx) {
      if (createPaymentTransaction && publicKey) {
        createPaymentTransaction()
          .then((tx) => {
            console.log("create payment transaction success", tx);
            if (tx) {
              setTx(tx);
            }
          })
          .catch((err) => {
            console.error("Error creating payment transaction:", err);
            setError(`Failed to create payment transaction: ${err}`);
          });
      } else {
        console.log(
          "missing init params",
          typeof createPaymentTransaction,
          publicKey
        );
      }
    }
  }, [tx, createPaymentTransaction, publicKey, setError]);

  useEffect(() => {
    if (tx) {
      setIsEstimatingFee(true);
      estimateTransactionFee(tx).then((fee) => {
        setIsEstimatingFee(false);
        setEstimatedFee(fee.toFixed(6)); // Format to 6 decimal places
      });
    }
  }, [tx, setIsEstimatingFee, setEstimatedFee]);

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
            setTransactionSignature(result.data.signature);
            setIsComplete(true);
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
          console.error("Error fetching Calculator:", err);
          setError(`Failed to Calculator: ${err}`);
        });
    }
  }, [order, setError, paymentToken]);

  // Handle payment
  const handlePay = useCallback(async () => {
    if (!isConnected || !publicKey) {
      await handleConnectWallet();
      return;
    }

    if (!order) {
      setError(`Order not found`);
      return;
    }

    try {
      setIsLoading(true);

      if (!tx) {
        throw new Error("Failed to create transaction");
      }

      // signAndSendTransaction 方法在 PhantomWalletAdapter 中返回deeplink url
      await signAndSendTransaction(tx);
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
    tx,
    handleConnectWallet,
    signAndSendTransaction,
    setError,
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
            {order?.paymentStatus !== "success" ? (
              <h1 className="font-bold text-5xl">Error</h1>
            ) : (
              <h1 className="font-bold text-5xl">Success</h1>
            )}

            <p className="py-6">{error}</p>

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
                {/* <div className="flex items-center">
              <span className="text-neutral-content">Merchant Address</span>
              <span className="font-mono flex-1 text-xs text-base-content text-right ml-2 break-all overflow-hidden">
                {order.merchantSolanaAddress}
              </span>
            </div> */}
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
                  <div className="text-xs text-right text-gray-400">
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
        <div className="flex flex-col text-center leading-none py-6 gap-3">
          <div className=" text-xs text-base-content">Powered by</div>
          <div className="flex justify-center">
            <img src={Logo} alt="Up Network" className="h-6" />
          </div>
        </div>

        {/* 按钮 */}
        <div className="p-4 right-0 bottom-2 left-0 absolute">
          {!isConnected ? (
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={handleConnectWallet}
            >
              Connect Wallet
            </button>
          ) : isComplete && transactionSignature ? (
            <>
              <div className="text-xs text-base-content text-center p-4">
                Pay Success!{" "}
                <a
                  href={getSolanaExplorerUrl(transactionSignature)}
                  target="_blank"
                  className="text-success hover:underline"
                >
                  View on Solana Explorer
                </a>
                .{" "}
                {orderConfirmed
                  ? "Order Confirmed!"
                  : "Confirming transaction..."}
              </div>
              {orderConfirmed ? (
                <button className="btn btn-success btn-block btn-lg">
                  Order Confirmed!
                </button>
              ) : (
                <button className="btn btn-primary btn-block btn-lg" disabled>
                  <span className="loading loading-spinner loading-xs"></span>
                  Pay {coinCalculator?.payTokenAmount}{" "}
                  {coinCalculator?.payTokenSymbol}
                </button>
              )}
            </>
          ) : (
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={handlePay}
              disabled={!tx}
            >
              Pay {coinCalculator?.payTokenAmount}{" "}
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
