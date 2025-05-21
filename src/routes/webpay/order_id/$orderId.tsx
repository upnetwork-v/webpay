import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getOrderById, coinCalculatorQuery } from "@/api/order";
import type { Order, CoinCalculator } from "@/types/payment";
import { usePhantomWallet } from "@/hooks/usePhantomWallet";
import { usePayment } from "@/hooks/usePayment";
import {
  getSolanaExplorerUrl,
  openPhantomSignAndSendTransactionDeeplink,
  decryptTransactionResponse,
} from "@/utils/phantom";
import { estimateTransactionFee } from "@/utils/feeEstimator";
import upnetworkLogo from "@/assets/img/upnetwork-logo.png";
import * as nacl from "tweetnacl";
import type { Transaction } from "@solana/web3.js";

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

  // Initialize Phantom wallet
  const {
    phantomConnected,
    phantomPublicKey,
    connectPhantom,
    dappKeyPair,
    phantomEncryptionPublicKey,
    phantomSession,
    processConnectCallback,
  } = usePhantomWallet();

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
    phantomPublicKey: phantomPublicKey,
  });

  const [tx, setTx] = useState<Transaction | null>(null);

  useEffect(() => {
    if (!tx) {
      if (
        createPaymentTransaction &&
        phantomEncryptionPublicKey &&
        phantomPublicKey
      ) {
        createPaymentTransaction().then((tx) => {
          console.log("create payment transaction", tx);
          setTx(tx);
        });
      } else {
        console.log(
          "missing init params",
          createPaymentTransaction,
          phantomEncryptionPublicKey,
          phantomPublicKey
        );
      }
    }
  }, [
    tx,
    createPaymentTransaction,
    phantomEncryptionPublicKey,
    phantomPublicKey,
  ]);

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
      try {
        console.log("Processing Phantom connection callback");
        const success = processConnectCallback(phantomPk, nonce, data);

        if (success) {
          // Clean up the URL
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        }
      } catch (error) {
        console.error("Error processing Phantom connection:", error);
        setError("Failed to connect to Phantom wallet");
      }
    }
    // Handle payment response
    else if (nonce && data && dappKeyPair && phantomEncryptionPublicKey) {
      const processPaymentResponse = async () => {
        try {
          console.log("Processing payment response from Phantom");
          const response = decryptTransactionResponse(
            phantomEncryptionPublicKey,
            nonce,
            data,
            dappKeyPair as nacl.BoxKeyPair
          );

          console.log("Payment successful:", response);
          setTransactionSignature(response.signature);
          setIsComplete(true);

          // Clean up the URL
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (err) {
          console.error("Error processing payment response:", err);
          setError("Failed to process payment response");
        }
      };

      processPaymentResponse();
    }
    // Handle payment errors
    else if (errorCode) {
      const errorMessage =
        urlParams.get("errorMessage") || "Payment was cancelled or failed";
      console.error("Payment error:", { errorCode, errorMessage });
      setError(`Payment failed: ${errorMessage}`);

      // Clean up the URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [
    orderId,
    processConnectCallback,
    dappKeyPair,
    phantomEncryptionPublicKey,
    setError,
  ]);

  // Connect to Phantom wallet
  const handleConnectWallet = useCallback(async () => {
    try {
      if (!dappKeyPair) {
        throw new Error("Wallet initialization in progress. Please try again.");
      }

      // Clear any existing connection state
      localStorage.removeItem("phantom_encryption_public_key");
      localStorage.removeItem("phantom_public_key");
      localStorage.removeItem("phantom_session");

      await connectPhantom();
    } catch (err) {
      console.error("Wallet connection error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to connect wallet. Please try again."
      );
    }
  }, [connectPhantom, setError, dappKeyPair]);

  // Fetch order details
  useEffect(() => {
    if (orderId) {
      setIsLoading(true);
      getOrderById(orderId)
        .then(setOrder)
        .catch((err) => {
          console.error("Error fetching order:", err);
          setError("Failed to load order details");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [orderId, setError]);

  //
  useEffect(() => {
    if (order) {
      coinCalculatorQuery({
        orderValue: order.orderValue,
        tokenAddress: order.defaultPaymentToken,
      })
        .then(setCoinCalculator)
        .catch((err) => {
          console.error("Error fetching Calculator:", err);
          setError("Failed to Calculator");
        });
    }
  }, [order, setError]);

  // Handle payment
  const handlePay = useCallback(async () => {
    if (!phantomConnected || !phantomPublicKey) {
      await handleConnectWallet();
      return;
    }

    if (!order) {
      setError("Order not found");
      return;
    }

    try {
      setIsLoading(true);

      if (!tx) {
        throw new Error("Failed to create transaction");
      }

      if (!phantomEncryptionPublicKey) {
        throw new Error("Missing Phantom encryption public key");
      }

      if (!phantomSession) {
        throw new Error("Missing Phantom session token");
      }

      if (!dappKeyPair) {
        throw new Error("DApp key pair not initialized");
      }

      // Get the current URL for redirect
      const redirectUrl = `${window.location.origin}${window.location.pathname}`;

      console.log("Opening Phantom deeplink with transaction:", {
        feePayer: tx.feePayer?.toBase58(),
        recentBlockhash: tx.recentBlockhash,
        instructions: tx.instructions.length,
        signers: tx.signatures.length,
        redirectUrl,
      });

      // Open Phantom deeplink for signing
      openPhantomSignAndSendTransactionDeeplink(
        tx,
        redirectUrl,
        phantomEncryptionPublicKey,
        dappKeyPair as nacl.BoxKeyPair,
        phantomSession
      );

      console.log("Phantom deeplink opened with redirectUrl:", redirectUrl);
    } catch (err) {
      console.error("Payment error:", err);
      setError(err instanceof Error ? err.message : "Payment failed");
      setIsLoading(false);
    }
  }, [
    phantomConnected,
    phantomPublicKey,
    order,
    tx,
    handleConnectWallet,
    phantomEncryptionPublicKey,
    phantomSession,
    dappKeyPair,
    setError,
  ]);

  // confirm order
  const orderConfirmed = useMemo(() => {
    if (!order) return false;
    return order.paymentStatus === 2;
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
      requestTimeout.current = setInterval(pollOrder, 3000);
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
      <div className="hero bg-base-200 min-h-screen">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="text-5xl font-bold">Error</h1>
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
                    {order.orderValue} {order.currency}
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
                    {coinCalculator?.tokenAmount} {coinCalculator?.tokenSymbol}
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
                      `${coinCalculator.tokenAmount} ${coinCalculator.tokenSymbol}`
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
        <div className="flex flex-col text-center leading-none gap-2">
          <div className=" text-xs text-base-content">Powered by</div>
          <div className="flex justify-center">
            <img src={upnetworkLogo} alt="Up Network" className="h-6" />
          </div>
        </div>

        {/* 支付按钮 */}
        <div className="p-4 right-0 bottom-2 left-0 absolute">
          {!phantomConnected ? (
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={handleConnectWallet}
            >
              Connect Phantom Wallet
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
                . Confirming transaction...
              </div>
              <button className="btn btn-primary btn-block btn-lg" disabled>
                <span className="loading loading-spinner loading-xs"></span>
                Pay {coinCalculator?.tokenAmount} {coinCalculator?.tokenSymbol}
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={handlePay}
              disabled={!tx}
            >
              Pay {coinCalculator?.tokenAmount} {coinCalculator?.tokenSymbol}
            </button>
          )}
        </div>
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
