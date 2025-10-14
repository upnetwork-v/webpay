import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getOrderById, coinCalculatorQuery } from "@/api/order";
import type { Order, CoinCalculator } from "@/types";
import { Transaction } from "@solana/web3.js";
import { useWallet } from "@/wallets/provider/useWallet";
import { getSolanaExplorerUrl, estimateTransactionFee } from "@/utils";
import bs58 from "bs58";
import Logo from "@/assets/img/logo.svg";
import { usePayment } from "@/hooks";
import OrderDetailCard from "@/components/orderDetailCard";
import CheckIcon from "@/assets/img/check.png";
import { useAuthStore } from "@/stores";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import KYCStatus from "@/components/KYCStatus";
import { updateOrderStatus } from "@/api/order";
import { TrustWalletAdapter } from "@/wallets/adapters/trust/TrustWalletAdapter";

export default function PaymentPage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [coinCalculator, setCoinCalculator] = useState<CoinCalculator | null>(
    null
  );
  const [isLoadingCalculator, setIsLoadingCalculator] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState<
    string | null
  >(null);
  const [estimatedFee, setEstimatedFee] = useState<string>("0");
  const [isEstimatingFee, setIsEstimatingFee] = useState<boolean>(false);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(() => {
    // Initialize payment processing state based on URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const nonce = urlParams.get("nonce");
    const data = urlParams.get("data");
    const phantomPk = urlParams.get("phantom_encryption_public_key");
    // If we have payment callback parameters, we're processing a payment
    return !!(nonce && data && !phantomPk);
  });

  // Check URL parameters to determine if we're in a payment callback state
  const urlParams = new URLSearchParams(window.location.search);
  const phantomPk = urlParams.get("phantom_encryption_public_key");
  const nonce = urlParams.get("nonce");
  const data = urlParams.get("data");
  const errorCode = urlParams.get("errorCode");

  // Determine payment flow state from URL
  const isPaymentCallback = !!(nonce && data && !phantomPk);

  // Authentication state
  const { isAuthenticated, user } = useAuthStore();

  const {
    state,
    adapter,
    signTransaction,
    sendRawTransaction,
    handleConnectCallback,
    handlePaymentCallback,
    sendTrustWalletPayment,
    openWalletSelector,
  } = useWallet();
  const { isConnected, publicKey } = state;

  // Get payment token
  const paymentToken = useMemo(() => {
    if (!order) return null;
    return (
      order.supportTokenList.find(
        (token) =>
          token.chainName?.toLowerCase() === "solana" &&
          token.symbol.toLowerCase() === "usdc"
        // 临时锁定 Solana usdc 支付
        // token.symbol ===
        //   (order.paymentStatus === "success"
        //     ? order.paymentResult?.symbol
        //     : order.defaultPaymentToken)
      ) || null
    );
  }, [order]);

  // Initialize payment logic with proper error handling
  // Always call usePayment hook to maintain hook consistency
  const paymentHook = usePayment({
    order: order,
    paymentToken: paymentToken,
    coinCalculator: coinCalculator,
    phantomPublicKey: publicKey,
  });

  const { error, createPaymentTransaction, checkBalance, setError } =
    paymentHook;

  const [tx, setTx] = useState<Transaction | null>(null);

  useEffect(() => {
    // Trust Wallet 不需要预先创建交易，跳过
    if (state.walletType === "trust") {
      console.log("[Trust Wallet] Skipping transaction creation");
      return;
    }

    if (!tx && !isLoadingCalculator && !error) {
      if (createPaymentTransaction && publicKey && coinCalculator) {
        // Clear any previous errors before attempting to create transaction
        setError(null);

        createPaymentTransaction()
          .then((tx) => {
            console.log("create payment transaction success", tx);
            if (tx) {
              setTx(tx);
            }
          })
          .catch((err) => {
            console.error("Error creating payment transaction:", err);
            // Ensure error is properly handled and displayed
            const errorMessage =
              err instanceof Error ? err.message : String(err);

            // Check for different types of balance-related errors
            if (
              errorMessage.includes("Insufficient balance") ||
              errorMessage.includes("insufficient funds") ||
              errorMessage.includes("shortfall")
            ) {
              setError(errorMessage);
            } else if (errorMessage.includes("Token Account not found")) {
              setError(
                "Token not found in wallet. Please add the required token to your wallet first."
              );
            } else if (
              errorMessage.includes("Receiver Token Account not found")
            ) {
              setError("Payment processing error. Please try again later.");
            } else {
              setError(`Transaction creation failed: ${errorMessage}`);
            }
          });
      } else {
        console.log(
          "Transaction creation skipped - missing required parameters:",
          {
            hasCreatePaymentTransaction: !!createPaymentTransaction,
            hasPublicKey: !!publicKey,
            hasCoinCalculator: !!coinCalculator,
            isLoadingCalculator,
          }
        );
      }
    }
  }, [
    tx,
    state.walletType,
    createPaymentTransaction,
    publicKey,
    coinCalculator,
    isLoadingCalculator,
    error,
    setError,
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
    // Use the URL parameters already parsed above

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
          if (result.success && result.type === "signTransaction") {
            if (
              typeof result.data === "object" &&
              result.data !== null &&
              "transaction" in result.data &&
              typeof (result.data as { transaction?: unknown }).transaction ===
              "string"
            ) {
              // 签名成功，现在需要广播交易
              try {
                const signedTxData = (result.data as { transaction: string })
                  .transaction;
                // Phantom 返回的是 base58 编码的交易数据
                const signedTransaction = Transaction.from(
                  bs58.decode(signedTxData)
                );
                const txHash = await sendRawTransaction(signedTransaction);
                setTransactionSignature(txHash);
                setIsComplete(true);
                setIsPaymentProcessing(false);
              } catch (broadcastError) {
                console.error(
                  "Error broadcasting transaction:",
                  broadcastError
                );
                setError(`Failed to broadcast transaction: ${broadcastError}`);
                setIsPaymentProcessing(false);
              }
            } else {
              setError("Payment response missing transaction data");
              setIsPaymentProcessing(false);
            }
          } else if (!result.success) {
            setError(result.error || "Payment failed");
            setIsPaymentProcessing(false);
          }

          // Clean up the URL
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (err) {
          console.error("Error processing payment response:", err);
          setError(`Failed to process payment response: ${err}`);
          setIsPaymentProcessing(false);
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
    if (order && paymentToken) {
      if (!paymentToken?.paymentAddress) {
        setError("Payment address is not set");
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

      setIsLoadingCalculator(true);
      coinCalculatorQuery({
        id: order.orderId,
        symbol: paymentToken?.symbol || "",
        tokenAddress: paymentToken?.tokenAddress,
      })
        .then((calculator) => {
          setCoinCalculator(calculator);
          setIsLoadingCalculator(false);
        })
        .catch((err) => {
          console.error("Error fetching Calculator:", err);
          setError(`Failed to Calculator: ${err}`);
          setIsLoadingCalculator(false);
        });
    }
  }, [order, setError, paymentToken]);

  // Handle payment
  const handlePay = useCallback(async () => {
    console.log("[handlePay] Called with:", {
      isConnected,
      publicKey,
      walletType: state.walletType,
      hasAdapter: !!adapter,
      capabilities: adapter?.capabilities,
      hasOrder: !!order,
      hasPaymentToken: !!paymentToken,
      hasCoinCalculator: !!coinCalculator,
    });

    // Trust Wallet 不需要 publicKey（会自动使用用户当前账户）
    if (!isConnected || (!publicKey && state.walletType !== "trust")) {
      console.log("handlePay not connected", isConnected, publicKey);
      await handleConnectWallet();
      return;
    }

    if (!order) {
      setError(`Order not found`);
      return;
    }

    try {
      setIsPaymentProcessing(true);

      console.log("[handlePay] Checking wallet capabilities:", adapter?.capabilities);

      // 判断钱包类型
      if (adapter?.capabilities.supportsSeparateSign) {
        // ===== Phantom / OKX 流程（现有逻辑） =====
        if (!tx) {
          throw new Error("Failed to create transaction");
        }

        console.log("Starting payment process...");

        try {
          // 1. 签名交易
          const signedTransaction = await signTransaction(tx);
          console.log("Transaction signed successfully");

          // 2. 广播交易
          const txHash = await sendRawTransaction(signedTransaction);
          console.log("Transaction broadcasted successfully:", txHash);

          // 3. 设置结果
          setTransactionSignature(txHash);
          setIsComplete(true);
          setIsPaymentProcessing(false);
        } catch (signError: unknown) {
          // 如果是 Phantom 钱包的重定向错误，说明需要等待回调处理
          if (
            signError instanceof Error &&
            signError.message === "PHANTOM_REDIRECT_PENDING"
          ) {
            console.log(
              "Phantom wallet redirect pending, waiting for callback..."
            );
            // 保持 payment processing 状态，不重置
            // 不设置错误，让回调处理完成支付流程
            return;
          }
          // 其他错误正常抛出
          throw signError;
        }
      } else if (adapter?.capabilities.needsUserConfirmation) {
        // ===== Trust Wallet 流程（新增） =====
        if (!paymentToken || !coinCalculator) {
          throw new Error("Missing payment parameters");
        }

        console.log("Starting Trust Wallet payment process...");

        // 构建 UAI 格式的 asset
        const asset = TrustWalletAdapter.toUAI(
          paymentToken.tokenAddress || null
        );

        // 计算金额（转换为实际单位）
        const amount = (
          Number(coinCalculator.payTokenAmount) /
          10 ** (paymentToken.decimal || 6)
        ).toString();

        // 构建 base64 编码的 memo
        const memoData = btoa(JSON.stringify({
          webpay: {
            orderId: order.orderId,
          },
        }));

        console.log("[Trust Wallet] Payment params:", {
          to: paymentToken.paymentAddress,
          amount,
          asset,
          memo: memoData,
        });

        // 发起支付（会显示确认弹窗）
        await sendTrustWalletPayment(
          {
            to: paymentToken.paymentAddress,
            amount: amount,
            asset: asset,
            memo: memoData,
          },
          // 用户确认后的回调
          () => {
            console.log("[Trust Wallet] User confirmed payment completion");
            // 设置占位符，触发轮询
            setTransactionSignature("trust_wallet_pending");
            setIsComplete(true);
            setIsPaymentProcessing(false);
          }
        );
      } else {
        throw new Error("Unsupported wallet type");
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Payment failed";
      console.error("Payment process failed:", err);

      // Categorize and handle different types of errors
      if (
        errorMessage.includes("Insufficient balance") ||
        errorMessage.includes("insufficient funds") ||
        errorMessage.includes("shortfall")
      ) {
        setError(errorMessage);
      } else if (errorMessage.includes("User rejected")) {
        setError("Payment was cancelled by user");
      } else if (
        errorMessage.includes("Network error") ||
        errorMessage.includes("fetch")
      ) {
        setError(
          "Network connection error. Please check your internet connection and try again."
        );
      } else if (errorMessage.includes("Transaction failed")) {
        setError("Transaction failed. Please try again.");
      } else {
        setError(`Payment failed: ${errorMessage}`);
      }
      setIsPaymentProcessing(false);
    }
  }, [
    isConnected,
    publicKey,
    order,
    tx,
    adapter,
    paymentToken,
    coinCalculator,
    state.walletType,
    handleConnectWallet,
    signTransaction,
    sendRawTransaction,
    sendTrustWalletPayment,
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

  // 从订单结果中提取真实的交易哈希 (Trust Wallet)
  useEffect(() => {
    if (
      orderConfirmed &&
      transactionSignature === "trust_wallet_pending" &&
      order?.paymentResult?.txHash
    ) {
      console.log(
        "[Trust Wallet] Extracting real transaction hash:",
        order.paymentResult.txHash
      );
      // 更新为真实的交易哈希
      setTransactionSignature(order.paymentResult.txHash);
    }
  }, [orderConfirmed, transactionSignature, order]);

  // update order status
  useEffect(() => {
    if (
      order &&
      orderConfirmed &&
      transactionSignature &&
      paymentToken &&
      coinCalculator &&
      publicKey
    ) {
      const updateOrderStatusParams = {
        collectWallet: paymentToken?.paymentAddress || "",
        cryptoAmount: (Number(order.orderValue) / 100).toFixed(2),
        cryptoSymbol: coinCalculator?.payTokenSymbol || "",
        cryptoTxHash: transactionSignature || "",
        payerWallet: publicKey || "",
        paymentStatus: "success",
        transactionId: order.orderId,
      };

      updateOrderStatus(updateOrderStatusParams)
        .then((res) => {
          console.log(
            "update order status success",
            updateOrderStatusParams,
            res
          );
        })
        .catch((err) => {
          console.error(
            "Error updating order status:",
            updateOrderStatusParams,
            err
          );
        });
    }
  }, [
    order,
    orderConfirmed,
    transactionSignature,
    paymentToken,
    coinCalculator,
    publicKey,
  ]);

  // Determine what to render
  const shouldShowError = !!error;

  // Calculate error types once
  const isBalanceError = error
    ? error.includes("Insufficient balance") ||
    error.includes("insufficient funds") ||
    error.includes("shortfall")
    : false;

  const isTokenNotFoundError = error
    ? error.includes("Token not found in wallet")
    : false;
  const isUserCancelledError = error
    ? error.includes("cancelled by user")
    : false;
  const isNetworkError = error
    ? error.includes("Network connection error")
    : false;

  const MainButtonClass =
    "bg-gradient-to-b from-white rounded-full to-neutral-200 border-[0] text-neutral btn btn-primary btn-block btn-lg";

  const upToLimit = useMemo(() => {
    return user && user.transaction_limit
      ? Number(user.transaction_total) >= Number(user.transaction_limit) &&
      user.verified !== 2
      : false;
  }, [user]);

  // Render based on error state or normal payment flow
  return (
    <div className="h-full bg-base-200 relative overflow-auto">
      {shouldShowError ? (
        // Error state UI
        <div className="max-w-md">
          <h1 className="font-bold text-5xl">
            {isBalanceError
              ? "Insufficient Balance"
              : isTokenNotFoundError
                ? "Token Not Found"
                : isUserCancelledError
                  ? "Payment Cancelled"
                  : isNetworkError
                    ? "Connection Error"
                    : "Payment Error"}
          </h1>

          <div className="py-6">
            <div className="space-y-4">
              <p className="text-lg">{error}</p>

              {isBalanceError && (
                <div className="alert alert-warning">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="stroke-current shrink-0 h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  <div>
                    <h3 className="font-bold">Check your wallet balance</h3>
                    <div className="text-xs">
                      Make sure you have sufficient{" "}
                      {paymentToken?.symbol || "tokens"} and SOL for transaction
                      fees
                    </div>
                  </div>
                </div>
              )}

              {isTokenNotFoundError && (
                <div className="alert alert-info">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="stroke-current shrink-0 h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <h3 className="font-bold">Add token to your wallet</h3>
                    <div className="text-xs">
                      Add {paymentToken?.symbol || "the required token"} to your
                      wallet and try again
                    </div>
                  </div>
                </div>
              )}

              {isNetworkError && (
                <div className="alert alert-error">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="stroke-current shrink-0 h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <h3 className="font-bold">Connection problem</h3>
                    <div className="text-xs">
                      Check your internet connection and try again
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <button
              className="btn btn-primary btn-block"
              onClick={() => {
                setError(null);
                setTx(null); // Reset transaction to trigger recreation
              }}
            >
              {isBalanceError
                ? "Check Balance Again"
                : isNetworkError
                  ? "Retry Connection"
                  : "Try Again"}
            </button>

            <button
              className="btn btn-outline btn-block"
              onClick={() => {
                setError(null);
                setTx(null);
              }}
            >
              Back to Payment
            </button>
          </div>
        </div>
      ) : (
        // Normal payment UI
        <div className="flex h-full bg-base-300 w-full justify-center items-center py-4 px-8 pb-8 ">
          <div>
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
              isLoading={isLoading || isLoadingCalculator}
            />

            {/* 按钮 */}
            {isAuthenticated ? (
              !orderConfirmed ? (
                <div className="py-4">
                  <div className="mx-auto max-w-md px-1">
                    {upToLimit ? null : !isConnected ? (
                      <button
                        className={MainButtonClass}
                        onClick={handleConnectWallet}
                      >
                        Connect Wallet
                      </button>
                    ) : isComplete && transactionSignature ? (
                      <>
                        <div className="text-xs text-base-content text-center p-4">
                          Pay Success!{" "}
                          {/* Trust Wallet 暂时没有交易哈希，不显示链接 */}
                          {transactionSignature !== "trust_wallet_pending" && (
                            <>
                              <a
                                href={getSolanaExplorerUrl(transactionSignature)}
                                target="_blank"
                                className="link link-primary"
                              >
                                View on Solana Explorer
                              </a>
                              .
                            </>
                          )}
                        </div>
                        <button className={MainButtonClass} disabled>
                          <span className="loading loading-spinner loading-xs"></span>
                          Confirming transaction...
                        </button>
                      </>
                    ) : (
                      <button
                        className={MainButtonClass}
                        onClick={async () => {
                          // Trust Wallet 跳过余额检查（会在钱包内检查）
                          if (state.walletType !== "trust") {
                            // Double-check balance before payment
                            const balanceCheck = await checkBalance();
                            if (!balanceCheck.sufficient) {
                              setError(balanceCheck.details);
                              return;
                            }
                          }
                          handlePay();
                        }}
                        disabled={
                          // Trust Wallet 不需要预先创建交易，所以不检查 tx
                          (state.walletType !== "trust" && !tx) ||
                          isLoading ||
                          isLoadingCalculator ||
                          isPaymentProcessing ||
                          isPaymentCallback
                        }
                      >
                        {isLoading ||
                          isPaymentProcessing ||
                          isPaymentCallback ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : null}
                        {isPaymentCallback
                          ? "Processing Payment..."
                          : isPaymentProcessing
                            ? "Sending..."
                            : "Pay Now"}
                      </button>
                    )}
                  </div>
                  {/* kyc status */}
                  <KYCStatus user={user} upToLimit={upToLimit} />
                </div>
              ) : null
            ) : (
              <GoogleLoginButton />
            )}
          </div>
        </div>
      )}
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
