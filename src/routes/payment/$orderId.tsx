import React, { useEffect, useState, useRef } from "react";
import bs58 from "bs58";
import { createFileRoute } from "@tanstack/react-router";
import nacl from "tweetnacl";

import { getOrderById } from "@/api/order";
import type { Order } from "@/types/payment";
import { PhantomDownloadPrompt } from "@/components/PhantomDownloadPrompt";
import {
  openPhantomConnectDeeplink,
  openPhantomSignAndSendTransactionDeeplink,
  getRedirectAfterTransactionUrl,
  decryptPhantomPayload,
} from "@/utils/phantom";
import { createUsdcTransferTransaction } from "@/utils/transaction";
import { createSolTransferTransaction } from "@/utils/transaction";

// --- Main Page Component ---
const PaymentPage: React.FC = () => {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [showPhantomDownloadPrompt, setShowPhantomDownloadPrompt] =
    useState(false);
  const deeplinkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [phantomConnected, setPhantomConnected] = useState(false);
  const [phantomPublicKey, setPhantomPublicKey] = useState<string | null>(null);
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
      setError(urlParams.get("errorMessage") || "Payment failed");
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
      setPhantomConnected(true);
      try {
        const publicKey = decryptPhantomPayload(
          phantom_pk,
          nonce,
          data,
          dappKeyPair
        );
        setPhantomPublicKey(publicKey);
      } catch {
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
    openPhantomConnectDeeplink(bs58.encode(dappKeyPair.publicKey));
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
    setShowPhantomDownloadPrompt(false);
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

      // 跳转 deeplink前打印base64
      const serializedBase64 = tx
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64");
      console.log("Serialized transaction (base64):", serializedBase64);

      // 记录当前页面路径
      const before = window.location.href;
      console.log("Current URL before deeplink:", before);

      // 跳转 deeplink
      openPhantomSignAndSendTransactionDeeplink(
        tx,
        getRedirectAfterTransactionUrl(orderId)
      );

      // 1.5秒后检查页面是否还在原页面，如果是则弹窗提示
      deeplinkTimeoutRef.current = setTimeout(() => {
        if (window.location.href === before) {
          setShowPhantomDownloadPrompt(true);
        }
      }, 1500);
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
    <div className="max-w-md mx-auto p-4 bg-white rounded shadow mt-8">
      <h2 className="text-xl font-bold mb-2">Order Payment</h2>
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
          <div>
            <b>USDC Mint:</b> {order.usdcMint}
          </div>
        )}
        <div className="break-all">
          <b>Recipient:</b> {order.recipient}
        </div>
      </div>
      {!phantomConnected ? (
        <button
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 mb-4"
          onClick={handleConnectPhantom}
        >
          Connect Phantom Wallet
        </button>
      ) : (
        <div className="mb-2 text-green-700">Phantom Wallet Connected</div>
      )}
      <button
        className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
        onClick={handlePay}
      >
        Pay with Phantom
      </button>
      <div className="text-xs text-gray-500 mt-2">
        You will be redirected to Phantom App to complete the payment.
      </div>
      {showPhantomDownloadPrompt && (
        <PhantomDownloadPrompt
          onClose={() => setShowPhantomDownloadPrompt(false)}
        />
      )}
    </div>
  );
};

export const Route = createFileRoute("/payment/$orderId")({
  component: PaymentPage,
});
