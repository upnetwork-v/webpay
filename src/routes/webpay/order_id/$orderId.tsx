import { useEffect, useState, useMemo, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getOrderById, coinCalculatorQuery } from "@/api/order";
import type { Order, CoinCalculator } from "@/types/payment";
import { usePhantomWallet } from "@/hooks/usePhantomWallet";
import { usePayment } from "@/hooks/usePayment";
import { handleTransactionResponse } from "@/utils/transactionHandlers";
import { getSolanaExplorerUrl } from "@/utils/phantom";
import upnetworkLogo from "@/assets/img/upnetwork-logo.png";

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      signAndSendTransaction: (
        transaction: any
      ) => Promise<{ signature: string }>;
    };
  }
}

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

  // Initialize Phantom wallet
  const { phantomConnected, phantomPublicKey, connectPhantom } =
    usePhantomWallet();

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

  // Handle errors
  useEffect(() => {
    if (error) {
      console.error("Payment error:", error);
    }
  }, [error]);

  // Connect to Phantom wallet
  const handleConnectWallet = useCallback(async () => {
    try {
      await connectPhantom();
    } catch (err) {
      console.error("Wallet connection error:", err);
      setError("Failed to connect wallet. Please try again.");
    }
  }, [connectPhantom, setError]);

  // Fetch order details
  useEffect(() => {
    if (!orderId) {
      setError(
        "Please provide an order_id in the URL (e.g., /webpay?order_id=123)"
      );
      setIsLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        setIsLoading(true);
        const orderData = await getOrderById(orderId);
        setOrder(orderData);

        // Fetch coin calculator data if order exists
        if (orderData) {
          const calculatorData = await coinCalculatorQuery({
            orderValue: orderData.orderValue,
            tokenAddress: orderData.defaultPaymentToken,
          });

          if (calculatorData) {
            setCoinCalculator(calculatorData);
          }
        }
      } catch (err) {
        console.error("Error fetching order:", err);
        setError("Failed to load order details");
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

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

      // Create payment transaction
      const tx = await createPaymentTransaction();
      if (!tx) {
        throw new Error("Failed to create transaction");
      }

      // Convert transaction to buffer for Phantom
      const serializedTx = tx.serialize({ requireAllSignatures: false });
      const transaction = {
        message: serializedTx.toString("base64"),
      };

      // Sign and send the transaction using Phantom
      if (!window.solana) {
        throw new Error("Phantom wallet not found");
      }

      const { signature } =
        await window.solana.signAndSendTransaction(transaction);

      if (!signature) {
        throw new Error("Transaction was not signed");
      }

      // Handle the transaction response
      await handleTransactionResponse(
        new URLSearchParams(window.location.search),
        async () => ({
          signature,
        }),
        (sig: string) => {
          setTransactionSignature(sig);
          setIsComplete(true);
        },
        (err: string) => {
          setError(err);
        }
      );

      console.log("Payment successful:", signature);
    } catch (err) {
      console.error("Payment error:", err);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    phantomConnected,
    phantomPublicKey,
    order,
    createPaymentTransaction,
    handleConnectWallet,
    setError,
  ]);

  // Render error state
  if (error) {
    return (
      <div className="flex min-h-screen bg-gray-50 items-center justify-center">
        <div className="bg-white rounded-lg max-w-md shadow-md text-center w-full p-8">
          <h2 className="font-bold mb-4 text-2xl text-red-600">Error</h2>
          <p className="mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-blue-600 text-white py-2 px-4 transition-colors hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Render payment complete state
  if (isComplete && transactionSignature) {
    return (
      <div className="flex min-h-screen bg-gray-50 items-center justify-center">
        <div className="bg-white rounded-lg max-w-md shadow-md text-center w-full p-8">
          <h2 className="font-bold mb-4 text-2xl text-green-600">
            Payment Complete!
          </h2>
          <a
            href={getSolanaExplorerUrl(transactionSignature)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            View on Solana Explorer
          </a>
        </div>
      </div>
    );
  }

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50 items-center justify-center">
        <div className="text-center">
          <div className="rounded-full mx-auto border-b-2 border-blue-500 h-12 mb-4 animate-spin w-12"></div>
          <p>Loading order details...</p>
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
                  <span className="text-neutral-content">Fees</span>
                  <span className="flex-1 text-base-content text-ellipsis text-right overflow-hidden">
                    {!coinCalculator && (
                      <div className="loading loading-spinner loading-xs"></div>
                    )}
                    {/* 计算 fee */}
                  </span>
                </div>

                <div className="flex items-center">
                  <span className="font-semibold text-white text-lg">
                    Sub Total
                  </span>

                  <p className="font-semibold flex-1 text-white text-right">
                    ≈{" "}
                    {!coinCalculator && (
                      <div className="loading loading-spinner loading-xs"></div>
                    )}
                    {coinCalculator?.tokenAmount} {coinCalculator?.tokenSymbol}
                  </p>
                </div>
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
              <span>Connect Phantom Wallet</span>
            </button>
          ) : (
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={handlePay}
            >
              <span>
                Pay {coinCalculator?.tokenAmount} {coinCalculator?.tokenSymbol}
              </span>
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
