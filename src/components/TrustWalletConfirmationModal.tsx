import React, { useState } from "react";
import { X } from "lucide-react";
import type { PaymentRequest } from "@/wallets/types/wallet";
import type { Order } from "@/types";
import { formatUnits } from "viem";

interface TrustWalletConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  paymentRequest: PaymentRequest | null;
  order: Order | null;
}

export const TrustWalletConfirmationModal: React.FC<
  TrustWalletConfirmationModalProps
> = ({ isOpen, onClose, onConfirm, onCancel, paymentRequest, order }) => {
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isOpen || !paymentRequest) return null;

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancel = () => {
    onCancel();
    onClose();
  };

  // 格式化地址显示
  const formatAddress = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  };

  // 获取代币显示名称
  const getTokenName = () => {
    if (
      !paymentRequest.tokenMint ||
      paymentRequest.tokenMint === "So11111111111111111111111111111111111111112"
    ) {
      return "SOL";
    }
    const token = order?.supportTokenList.find(
      (token) => token.tokenAddress === paymentRequest.tokenMint
    );
    return token?.symbol || "SPL Token";
  };

  return (
    <div className="flex inset-0 z-50 fixed items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="bg-black/50 inset-0 absolute backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div className="bg-white max-w-md rounded-2xl shadow-xl mx-4 w-full relative">
        {/* 头部 */}
        <div className="border-b flex border-gray-100 p-6 items-center justify-between">
          <h2 className="font-semibold text-xl text-gray-900">
            Confirm Payment
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 transition-colors text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6">
          {/* 支付信息 */}
          <div className="space-y-4 mb-6">
            <div className="rounded-lg bg-blue-50 p-4">
              <h3 className="font-medium text-sm mb-2 text-blue-900">
                Payment Details
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-700">Amount:</span>
                  <span className="font-medium text-blue-900">
                    {formatUnits(
                      BigInt(paymentRequest.amount),
                      paymentRequest.decimal
                    )}{" "}
                    {getTokenName()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">Recipient Address:</span>
                  <span className="font-mono text-blue-900">
                    {formatAddress(paymentRequest.recipientAddress)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">Order ID:</span>
                  <span className="font-medium text-blue-900">
                    {paymentRequest.orderId}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 说明文字 */}
          <div className="rounded-lg bg-amber-50 mb-6 p-4">
            <div className="flex space-x-3 items-start">
              <div className="flex-shrink-0 h-5 mt-0.5 w-5">
                <div className="rounded-full flex h-full bg-amber-400 w-full items-center justify-center">
                  <span className="font-bold text-white text-xs">!</span>
                </div>
              </div>
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">
                  Please complete the payment in Trust Wallet.
                </p>
                <p>
                  Trust Wallet should have automatically opened and displayed
                  the payment page. Please confirm the transaction in Trust
                  Wallet, then return here to confirm the payment status.
                </p>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex space-x-3">
            <button
              onClick={handleCancel}
              className="rounded-lg font-medium bg-gray-100 flex-1 py-3 px-4 transition-colors text-gray-700 hover:bg-gray-200"
              disabled={isConfirming}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="rounded-lg font-medium bg-blue-600 flex-1 text-white py-3 px-4 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isConfirming ? (
                <div className="flex space-x-2 items-center justify-center">
                  <div className="border-white border-t-transparent rounded-full border-2 h-4 animate-spin w-4" />
                  <span>Processing...</span>
                </div>
              ) : (
                "Payment completed"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
