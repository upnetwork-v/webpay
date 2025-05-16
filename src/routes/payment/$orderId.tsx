import { useEffect, useState, useRef } from "react";
import bs58 from "bs58";
import { createFileRoute } from "@tanstack/react-router";
import nacl from "tweetnacl";

import { getOrderById } from "@/api/order";
import type { Order } from "@/types/payment";
import {
  openPhantomConnectDeeplink,
  openPhantomSignAndSendTransactionDeeplink,
  decryptPhantomPayload,
} from "@/utils/phantom";
import { createUsdcTransferTransaction } from "@/utils/transaction";
import { createSolTransferTransaction } from "@/utils/transaction";

// --- Main Page Component ---
function PaymentPage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  useState(false);
  const deeplinkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [phantomConnected, setPhantomConnected] = useState(false);
  const [phantomPublicKey, setPhantomPublicKey] = useState<string | null>(null);
  const [phantomSession, setPhantomSession] = useState<string | null>(null);
  const [phantomEncryptionPublicKey, setPhantomEncryptionPublicKey] = useState<
    string | null
  >(null);
  const [dappKeyPair, setDappKeyPair] = useState<nacl.BoxKeyPair | null>(null);

  useEffect(() => {
    if (!orderId) return;
    getOrderById(orderId)
      .then(setOrder)
      .catch(() => setError("Order not found"))
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    // Handle Phantom deeplink redirect
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("signature")) {
      setComplete(true);
    }
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
  }, []);

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

        setPhantomPublicKey(decryptedData.public_key);
        setPhantomSession(decryptedData.session);
        setPhantomEncryptionPublicKey(phantom_pk);
        setPhantomConnected(true);

        console.log("Phantom 钱包连接成功", {
          publicKey: decryptedData.public_key,
          sessionAvailable: !!decryptedData.session,
        });
      } catch (err) {
        console.error("Phantom 钱包连接解密失败", err);
        setError("Phantom 钱包连接信息解密失败");
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

  const handleConnectPhantom = () => {
    if (!dappKeyPair) return;
    const dappPublicKey = bs58.encode(dappKeyPair.publicKey);
    console.log(
      "dappPublicKey (base58):",
      dappPublicKey,
      "length:",
      dappKeyPair.publicKey.length
    );
    openPhantomConnectDeeplink(dappPublicKey);
  };

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
      if (order.paymentType === "SPL") {
        if (!order.usdcMint) {
          throw new Error(
            "USDC mint address is required for SPL token payment"
          );
        }
        tx = await createUsdcTransferTransaction({
          from: phantomPublicKey,
          to: order.recipient,
          amount: order.amount,
          usdcMint: order.usdcMint,
          orderId: order.orderId,
          paymentType: "SPL",
        });
      } else {
        tx = await createSolTransferTransaction({
          from: phantomPublicKey,
          to: order.recipient,
          amount: order.amount,
          orderId: order.orderId,
          paymentType: "SOL",
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

      // 使用官方文档要求的所有参数调用 deeplink 方法
      // 在前面的验证确保了这些值不为null，但TypeScript需要类型断言
      openPhantomSignAndSendTransactionDeeplink(
        tx,
        redirectUrl,
        phantomEncryptionPublicKey as string,
        dappKeyPair as nacl.BoxKeyPair,
        phantomSession as string
      );

      console.log("Phantom deeplink opened with session");
    } catch (e) {
      console.error("Payment error:", e);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) return <div>Loading order...</div>;
  if (error) return <div style={{ color: "red" }}>Error: {error}</div>;
  if (complete) return <div>Payment complete! Thank you.</div>;
  if (!order) return null;

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
