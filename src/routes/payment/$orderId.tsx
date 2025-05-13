import React, { useEffect, useState, useRef } from "react";
import {
  PublicKey,
  Connection,
  Transaction,
  clusterApiUrl,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import bs58 from "bs58";
import { createFileRoute } from "@tanstack/react-router";

// --- Mock API ---
// In a real app, replace this with an actual API call
interface Order {
  orderId: string;
  amount: number;
  usdcMint: string;
  recipient: string;
  description: string;
}

async function getOrderById(orderId: string): Promise<Order> {
  // Mock order data
  // 延时1秒
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    orderId,
    amount: 1.5, // USDC amount
    usdcMint: "Es9vMFrzaCERZ6t2kF53wQ2hQz6bQ4FQp5uQ5Q5Q5Q5Q", // Mainnet USDC mint, replace with devnet if needed
    recipient: "J2nyQXEpxRJmt9bsCMF8T6pY4Q9vSmHMoUpfuAKuPHrD", // Replace with actual recipient
    description: "Test order for USDC payment",
  };
}

// --- Phantom Deeplink Utility ---
const PHANTOM_DEEPLINK_BASE_URL = "phantom://v1";
const DAPP_URL = window.location.origin;
const REDIRECT_AFTER_TRANSACTION_URL = `${DAPP_URL}/payment/${window.location.pathname.split("/").pop()}?deeplink=1`;
const SOLANA_NETWORK = "devnet";
const connection = new Connection(clusterApiUrl(SOLANA_NETWORK));

// Helper to create a Memo instruction
function createMemoInstruction(
  memo: string,
  signer: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    data: new TextEncoder().encode(memo) as Buffer,
  });
}

async function createUsdcTransferTransaction({
  from,
  to,
  amount,
  usdcMint,
  orderId,
}: {
  from: PublicKey;
  to: PublicKey;
  amount: number;
  usdcMint: PublicKey;
  orderId: string;
}): Promise<Transaction> {
  // USDC has 6 decimals
  const usdcDecimals = 6;
  const usdcAmount = Math.round(amount * 10 ** usdcDecimals);

  // Get associated token accounts
  const fromTokenAccount = await getAssociatedTokenAddress(usdcMint, from);
  const toTokenAccount = await getAssociatedTokenAddress(usdcMint, to);

  // Transfer instruction
  const transferIx = createTransferInstruction(
    fromTokenAccount,
    toTokenAccount,
    from,
    usdcAmount
  );

  // Memo instruction
  const memoIx = createMemoInstruction(orderId, from);

  const tx = new Transaction().add(transferIx, memoIx);
  tx.feePayer = from;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  return tx;
}

function openPhantomSignAndSendTransactionDeeplink(
  transaction: Transaction,
  redirectLink: string
) {
  const serialized = bs58.encode(
    transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
  );
  const params = new URLSearchParams({
    transaction: serialized,
    redirect_link: redirectLink,
  });
  const deeplinkUrl = `${PHANTOM_DEEPLINK_BASE_URL}/signAndSendTransaction?${params.toString()}`;
  window.location.href = deeplinkUrl;
}

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

  // 清理定时器
  useEffect(() => {
    return () => {
      if (deeplinkTimeoutRef.current) {
        clearTimeout(deeplinkTimeoutRef.current);
      }
    };
  }, []);

  const handlePay = async () => {
    setError(null);
    setShowPhantomDownloadPrompt(false);
    if (!order) return;
    try {
      // For demo, use recipient as placeholder for sender (Phantom will override)
      const placeholderSender = new PublicKey(order.recipient);
      const recipient = new PublicKey(order.recipient);
      const usdcMint = new PublicKey(order.usdcMint);
      const tx = await createUsdcTransferTransaction({
        from: placeholderSender,
        to: recipient,
        amount: order.amount,
        usdcMint,
        orderId: order.orderId,
      });
      // 记录当前页面路径
      const before = window.location.href;
      // 跳转 deeplink
      openPhantomSignAndSendTransactionDeeplink(
        tx,
        REDIRECT_AFTER_TRANSACTION_URL
      );
      // 1.5秒后检查页面是否还在原页面，如果是则弹窗提示
      deeplinkTimeoutRef.current = setTimeout(() => {
        if (window.location.href === before) {
          setShowPhantomDownloadPrompt(true);
        }
      }, 1500);
    } catch (e) {
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
          <b>Amount:</b> {order.amount} USDC
        </div>
        <div>
          <b>Recipient:</b> {order.recipient}
        </div>
      </div>
      <button
        className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
        onClick={handlePay}
      >
        Pay with Phantom
      </button>
      <div className="text-xs text-gray-500 mt-2">
        You will be redirected to Phantom App to complete the payment.
      </div>
      {/* Phantom 钱包下载提示弹窗 */}
      {showPhantomDownloadPrompt && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded shadow-lg max-w-xs text-center">
            <div className="text-lg font-semibold mb-2">
              未检测到 Phantom 钱包
            </div>
            <div className="mb-4 text-sm text-gray-600">
              未检测到 Phantom 钱包应用。请先下载安装后再尝试支付。
            </div>
            <a
              href="https://phantom.app/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 mb-2"
            >
              前往下载 Phantom
            </a>
            <br />
            <button
              className="text-gray-500 text-xs underline mt-2"
              onClick={() => setShowPhantomDownloadPrompt(false)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/payment/$orderId")({
  component: PaymentPage,
});
