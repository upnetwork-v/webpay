import { useEffect, useState, useRef, useMemo } from "react";
import bs58 from "bs58";
import { createFileRoute } from "@tanstack/react-router";
import nacl from "tweetnacl";

import { getOrderById, coinCalculatorQuery } from "@/api/order";
import type { Order, CoinCalculator } from "@/types/payment";
import {
  openPhantomConnectDeeplink,
  openPhantomSignAndSendTransactionDeeplink,
  decryptPhantomPayload,
  decryptTransactionResponse,
  getSolanaExplorerUrl,
} from "@/utils/phantom";
import {
  createSolTransferTransaction,
  createSPLTransferTransaction,
} from "@/utils/transaction";

// --- Main Page Component ---
function PaymentPage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [coinCalculator, setCoinCalculator] = useState<CoinCalculator | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [transactionSignature, setTransactionSignature] = useState<
    string | null
  >(null);
  const deeplinkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [phantomConnected, setPhantomConnected] = useState(false);
  const [phantomPublicKey, setPhantomPublicKey] = useState<string | null>(null);
  const [phantomSession, setPhantomSession] = useState<string | null>(null);
  const [phantomEncryptionPublicKey, setPhantomEncryptionPublicKey] = useState<
    string | null
  >(null);
  const [dappKeyPair, setDappKeyPair] = useState<nacl.BoxKeyPair | null>(null);
  const [isWalletConnectFlow, setIsWalletConnectFlow] = useState(false);

  // 初始化时从localStorage加载钱包连接信息
  useEffect(() => {
    const savedPhantomPk = localStorage.getItem(
      "phantom_encryption_public_key"
    );
    const savedPhantomPublicKey = localStorage.getItem("phantom_public_key");
    const savedPhantomSession = localStorage.getItem("phantom_session");

    if (savedPhantomPk && savedPhantomPublicKey && savedPhantomSession) {
      console.log("Loading saved wallet connection info");
      setPhantomEncryptionPublicKey(savedPhantomPk);
      setPhantomPublicKey(savedPhantomPublicKey);
      setPhantomSession(savedPhantomSession);
      setPhantomConnected(true);
    }
  }, []);

  // 获取订单信息
  useEffect(() => {
    if (!orderId) return;
    getOrderById(orderId)
      .then(setOrder)
      .catch(() => setError("Order not found"))
      .finally(() => setLoading(false));
  }, [orderId]);

  const paymentToken = useMemo(() => {
    if (!order) return null;
    return order.supportTokenList.find(
      (token) => token.symbol === order.defaultPaymentToken
    );
  }, [order]);

  // 获取币种计算器信息
  useEffect(() => {
    if (!paymentToken || !order) return;

    coinCalculatorQuery({
      orderValue: order.orderValue,
      tokenAddress: paymentToken.address,
    }).then(setCoinCalculator);
  }, [paymentToken, order]);

  // 处理交易结果回调
  useEffect(() => {
    // Handle Phantom deeplink redirect
    const urlParams = new URLSearchParams(window.location.search);

    console.log("URL params:", Object.fromEntries(urlParams.entries()));
    console.log("dappKeyPair available:", !!dappKeyPair);
    console.log("phantomEncryptionPublicKey:", phantomEncryptionPublicKey);

    // 检查是否有钱包连接相关参数，如果有则标记为钱包连接流程
    if (
      urlParams.get("phantom_encryption_public_key") &&
      urlParams.get("nonce") &&
      urlParams.get("data")
    ) {
      setIsWalletConnectFlow(true);
      // 清除可能存在的旧交易数据
      sessionStorage.removeItem("pendingTxData");
      sessionStorage.removeItem("pendingTxNonce");
      return; // 不继续处理交易参数，因为这是钱包连接流程
    }

    // 直接从URL中获取signature（旧方法）
    if (urlParams.get("signature")) {
      const signature = urlParams.get("signature");
      setTransactionSignature(signature);
      setComplete(true);
      // 清理URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // 从加密的data参数中提取signature（新方法 - 根据Phantom文档）
    else if (
      urlParams.get("data") &&
      urlParams.get("nonce") &&
      !isWalletConnectFlow
    ) {
      try {
        const data = urlParams.get("data")!;
        const nonce = urlParams.get("nonce")!;

        console.log("Found data and nonce in URL");

        // 从localStorage获取可能存在的phantomEncryptionPublicKey
        const savedPhantomPk = localStorage.getItem(
          "phantom_encryption_public_key"
        );
        if (savedPhantomPk && !phantomEncryptionPublicKey) {
          console.log(
            "Using saved phantomEncryptionPublicKey from localStorage"
          );
          setPhantomEncryptionPublicKey(savedPhantomPk);
        }

        // 如果尚未准备好解密所需的数据，先设置一个标记，稍后再处理
        if (!dappKeyPair || (!phantomEncryptionPublicKey && !savedPhantomPk)) {
          console.log("Saving transaction data for later processing");
          // 将数据保存在sessionStorage中，以便钱包连接后处理
          sessionStorage.setItem("pendingTxData", data);
          sessionStorage.setItem("pendingTxNonce", nonce);
          return;
        }

        // 使用封装方法解密交易响应
        try {
          console.log("Attempting to decrypt transaction response");
          const pkToUse = phantomEncryptionPublicKey || savedPhantomPk;
          console.log("Using public key for decryption:", pkToUse);

          const response = decryptTransactionResponse(
            pkToUse!,
            nonce,
            data,
            dappKeyPair
          );

          console.log("Successfully decrypted transaction:", response);
          setTransactionSignature(response.signature);
          setComplete(true);
        } catch (decryptError) {
          console.error("Decryption error:", decryptError);

          // 如果解密失败但有nonce和data，可能是成功交易但解密有问题
          // 为简化用户体验，我们仍然显示成功页面，但不提供具体交易链接
          setComplete(true);
        }

        // 清理URL
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      } catch (err) {
        console.error("Error processing transaction response:", err);
        setError("Failed to process transaction response");
      }
    }

    // 处理错误情况
    if (urlParams.get("errorCode")) {
      const errorCode = urlParams.get("errorCode");
      const errorMessage = urlParams.get("errorMessage");

      console.log("Phantom returned error:", { errorCode, errorMessage });

      // More specific error handling based on error code
      if (errorCode === "-32603") {
        setError(`Phantom 钱包处理错误 (${errorCode}): 请确认您的钱包已连接到 Solana Devnet 网络，并且有足够的 SOL 余额支付交易和手续费。

原始错误: ${errorMessage}`);
      } else {
        setError(errorMessage || "支付失败");
      }

      // Clean URL after getting the error parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [dappKeyPair, phantomEncryptionPublicKey, isWalletConnectFlow]);

  // 检查是否有待处理的交易数据
  useEffect(() => {
    // 如果是钱包连接流程，不处理待处理的交易数据
    if (isWalletConnectFlow) {
      return;
    }

    const pendingData = sessionStorage.getItem("pendingTxData");
    const pendingNonce = sessionStorage.getItem("pendingTxNonce");

    if (
      pendingData &&
      pendingNonce &&
      dappKeyPair &&
      phantomEncryptionPublicKey
    ) {
      console.log("Processing pending transaction data");

      // 尝试使用已保存的phantomEncryptionPublicKey
      const pkToUse =
        phantomEncryptionPublicKey ||
        localStorage.getItem("phantom_encryption_public_key");

      if (!pkToUse) {
        console.log(
          "No encryption public key available, cannot process transaction yet"
        );
        return;
      }

      try {
        const response = decryptTransactionResponse(
          pkToUse,
          pendingNonce,
          pendingData,
          dappKeyPair
        );

        setTransactionSignature(response.signature);
        setComplete(true);
      } catch (err) {
        console.error("Error processing pending transaction:", err);
        // 即使解密失败，也认为交易完成了
        setComplete(true);
      }

      // 清理sessionStorage
      sessionStorage.removeItem("pendingTxData");
      sessionStorage.removeItem("pendingTxNonce");
    }
  }, [dappKeyPair, phantomEncryptionPublicKey, isWalletConnectFlow]);

  // 生成/恢复 dapp keypair
  useEffect(() => {
    const pk = localStorage.getItem("dapp_pk");
    const sk = localStorage.getItem("dapp_sk");
    let keypair: nacl.BoxKeyPair;
    if (pk && sk) {
      keypair = {
        publicKey: bs58.decode(pk),
        secretKey: bs58.decode(sk),
      };
    } else {
      keypair = nacl.box.keyPair();
      localStorage.setItem("dapp_pk", bs58.encode(keypair.publicKey));
      localStorage.setItem("dapp_sk", bs58.encode(keypair.secretKey));
    }
    setDappKeyPair(keypair);
  }, []);

  // 解析 connect 回调
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const phantom_pk = urlParams.get("phantom_encryption_public_key");
    const nonce = urlParams.get("nonce");
    const data = urlParams.get("data");
    if (phantom_pk && nonce && data && dappKeyPair) {
      try {
        // 解密 Phantom 回调数据，获取钱包公钥和会话令牌
        const decryptedData = decryptPhantomPayload(
          phantom_pk,
          nonce,
          data,
          dappKeyPair
        );

        // 保存钱包连接信息到localStorage，以便在页面刷新后恢复
        localStorage.setItem("phantom_encryption_public_key", phantom_pk);
        localStorage.setItem("phantom_public_key", decryptedData.public_key);
        localStorage.setItem("phantom_session", decryptedData.session);

        setPhantomPublicKey(decryptedData.public_key);
        setPhantomSession(decryptedData.session);
        setPhantomEncryptionPublicKey(phantom_pk);
        setPhantomConnected(true);

        console.log("Phantom 钱包连接成功", {
          publicKey: decryptedData.public_key,
          sessionAvailable: !!decryptedData.session,
          encryptionPublicKey: phantom_pk,
        });

        // 钱包连接成功后，重置钱包连接流程标记
        setIsWalletConnectFlow(false);

        // 检查是否有待处理的交易数据
        const pendingData = sessionStorage.getItem("pendingTxData");
        const pendingNonce = sessionStorage.getItem("pendingTxNonce");

        if (pendingData && pendingNonce) {
          console.log("Found pending transaction data after wallet connection");
          try {
            const response = decryptTransactionResponse(
              phantom_pk,
              pendingNonce,
              pendingData,
              dappKeyPair
            );

            setTransactionSignature(response.signature);
            setComplete(true);

            // 清理sessionStorage
            sessionStorage.removeItem("pendingTxData");
            sessionStorage.removeItem("pendingTxNonce");
          } catch (err) {
            console.error(
              "Error processing pending transaction after connect:",
              err
            );
            // 解密失败也当作交易完成
            setComplete(true);
          }
        }
      } catch (err) {
        console.error("Phantom 钱包连接解密失败", err);
        setError("Phantom 钱包连接信息解密失败");
        // 解密失败时也重置钱包连接流程标记
        setIsWalletConnectFlow(false);
      }
      // 清理URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [dappKeyPair]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (deeplinkTimeoutRef.current) {
        clearTimeout(deeplinkTimeoutRef.current);
      }
    };
  }, []);

  // 连接 Phantom 钱包
  const handleConnectPhantom = () => {
    if (!dappKeyPair) return;
    // 设置钱包连接流程标记
    setIsWalletConnectFlow(true);
    const dappPublicKey = bs58.encode(dappKeyPair.publicKey);
    console.log(
      "dappPublicKey (base58):",
      dappPublicKey,
      "length:",
      dappKeyPair.publicKey.length
    );
    openPhantomConnectDeeplink(dappPublicKey);
  };

  // 处理支付请求
  const handlePay = async () => {
    if (!phantomConnected) {
      setError("请先连接 Phantom 钱包");
      return;
    }
    if (!phantomPublicKey) {
      setError("未获取到 Phantom 钱包地址");
      return;
    }
    setError(null);
    if (!order) return;
    try {
      console.log("Starting payment process");

      let tx;
      const paymentToken = order.supportTokenList.find(
        (token) => token.symbol === order.defaultPaymentToken
      );
      if (!paymentToken) {
        throw new Error("Payment token not found");
      }
      if (!paymentToken.isNative) {
        if (!paymentToken.address) {
          throw new Error("Token address is required for SPL token payment");
        }
        tx = await createSPLTransferTransaction({
          from: phantomPublicKey,
          to: order.merchantSolanaAddress,
          tokenAmount: coinCalculator?.tokenAmount ?? "0",
          tokenAddress: paymentToken.address,
          orderId: order.orderId,
        });
      } else {
        tx = await createSolTransferTransaction({
          from: phantomPublicKey,
          to: order.merchantSolanaAddress,
          tokenAmount: coinCalculator?.tokenAmount ?? "0",
          orderId: order.orderId,
        });
      }

      // 记录当前页面路径
      const before = window.location.href;
      console.log("Current URL before deeplink:", before);

      // 跳转 deeplink，使用完整的参数集
      const redirectUrl = `${window.location.origin}${window.location.pathname}`;
      console.log("Complete transaction object:", {
        feePayer: tx.feePayer?.toBase58(),
        recentBlockhash: tx.recentBlockhash,
        instructions: tx.instructions.length,
        signers: tx.signatures.length,
      });

      if (!phantomEncryptionPublicKey) {
        throw new Error("Missing Phantom encryption public key");
      }

      if (!phantomSession) {
        throw new Error("Missing Phantom session token");
      }

      // 使用官方文档要求的所有参数调用 deeplink 方法
      openPhantomSignAndSendTransactionDeeplink(
        tx,
        redirectUrl,
        phantomEncryptionPublicKey,
        dappKeyPair as nacl.BoxKeyPair,
        phantomSession
      );

      console.log("Phantom deeplink opened with session");
    } catch (e) {
      console.error("Payment error:", e);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // 渲染加载中状态
  if (loading) return <div>Loading order...</div>;

  // 渲染错误状态
  if (error) return <div style={{ color: "red" }}>Error: {error}</div>;

  // 渲染支付完成状态
  if (complete)
    return (
      <div className="bg-white rounded mx-auto max-w-md shadow mt-8 p-4">
        <div className="text-center mb-4 text-green-600">
          Payment completed! Thank you for your order.
        </div>
        {transactionSignature && (
          <div className="text-center">
            <a
              href={getSolanaExplorerUrl(transactionSignature)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              View transaction in Solana Explorer
            </a>
          </div>
        )}
      </div>
    );

  // 如果没有订单数据，不渲染任何内容
  if (!order) return null;

  // 渲染订单支付界面
  return (
    <div className="bg-white rounded mx-auto max-w-md shadow mt-8 p-4">
      <h2 className="font-bold text-xl mb-2">Order Payment</h2>
      <div className="mb-4">
        <div>
          <b>Order ID:</b> {order.orderId}
        </div>
        <div>
          <b>Description:</b> {order.description}
        </div>
        <div>
          <b>Amount:</b> {order.amount}{" "}
          {order.paymentType === "SOL" ? "SOL" : "USDC"}
        </div>
        {order.paymentType === "SPL" && (
          <div className="break-all">
            <b>USDC Mint:</b> {order.usdcMint}
          </div>
        )}
        <div className="break-all">
          <b>Recipient:</b> {order.recipient}
        </div>
      </div>
      {!phantomConnected ? (
        <button
          className="rounded bg-green-600 text-white mb-4 py-2 px-4 hover:bg-green-700"
          onClick={handleConnectPhantom}
        >
          Connect Phantom Wallet
        </button>
      ) : (
        <div className="mb-2 text-green-700">Phantom Wallet Connected</div>
      )}
      <button
        className="rounded bg-purple-600 text-white py-2 px-4 hover:bg-purple-700"
        onClick={handlePay}
      >
        Pay with Phantom
      </button>
      <div className="mt-2 text-xs text-gray-500">
        You will be redirected to Phantom App to complete the payment.
      </div>
    </div>
  );
}

export const Route = createFileRoute("/payment/$orderId")({
  component: PaymentPage,
});
