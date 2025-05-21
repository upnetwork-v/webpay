import { useEffect, useState, useMemo, useCallback } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
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

// Define route types
type SearchParams = {
  order_id?: string;
};

export default function PaymentPage() {
  const { order_id: orderId } = useSearch({ from: "/webpay" });
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

  // Initialize payment logic
  const { error, createPaymentTransaction, setError } = usePayment({
    order: order,
    paymentToken: useMemo(() => {
      if (!order) return null;
      return (
        order.supportTokenList.find(
          (token) => token.symbol === order.defaultPaymentToken
        ) || null
      );
    }, [order]),
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold text-green-600 mb-4">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading order details...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Render payment form
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <img className="h-8 w-auto" src={upnetworkLogo} alt="UpNetwork" />
          {phantomConnected && phantomPublicKey && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                {`${phantomPublicKey.toString().slice(0, 4)}...${phantomPublicKey.toString().slice(-4)}`}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Order Details
            </h3>
          </div>
          <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
            <dl className="sm:divide-y sm:divide-gray-200">
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Order ID</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {order?.orderId}
                </dd>
              </div>
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Amount</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {order?.orderValue} {order?.currency}
                </dd>
              </div>
              {coinCalculator && (
                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-500">
                    You'll pay
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                    {coinCalculator.tokenAmount} {coinCalculator.tokenSymbol}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          {!phantomConnected ? (
            <button
              onClick={handleConnectWallet}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Connect Phantom Wallet
            </button>
          ) : (
            <button
              onClick={handlePay}
              disabled={isLoading}
              className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white ${
                isLoading ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500`}
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Processing...
                </>
              ) : (
                `Pay ${coinCalculator?.tokenAmount || "0"} ${coinCalculator?.tokenSymbol || ""}`
              )}
            </button>
          )}
        </div>
        {error && <div className="mt-4 text-center text-red-600">{error}</div>}
      </main>

      <footer className="bg-white py-4 mt-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          Powered by UpNetwork
        </div>
      </footer>
    </div>
  );
}

export const Route = createFileRoute("/webpay-new")({
  component: PaymentPage,
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    return {
      order_id: search.order_id as string | undefined,
    };
  },
});
