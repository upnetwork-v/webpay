import React, { useState } from "react";
import { X } from "lucide-react";
import type { PaymentRequest } from "@/wallets/types/wallet";

interface TrustWalletConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  paymentRequest: PaymentRequest | null;
}

export const TrustWalletConfirmationModal: React.FC<
  TrustWalletConfirmationModalProps
> = ({ isOpen, onClose, onConfirm, onCancel, paymentRequest }) => {
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
    return "SPL Token";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">确认支付状态</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6">
          {/* 支付信息 */}
          <div className="space-y-4 mb-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-2">
                支付详情
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-700">金额:</span>
                  <span className="font-medium text-blue-900">
                    {paymentRequest.amount} {getTokenName()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">收款地址:</span>
                  <span className="font-mono text-blue-900">
                    {formatAddress(paymentRequest.recipientAddress)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700">订单号:</span>
                  <span className="font-medium text-blue-900">
                    {paymentRequest.orderId}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 说明文字 */}
          <div className="bg-amber-50 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-5 h-5 mt-0.5">
                <div className="w-full h-full bg-amber-400 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
              </div>
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">请在 Trust Wallet 中完成支付</p>
                <p>
                  Trust Wallet 应该已经自动打开并显示支付页面。 请在 Trust
                  Wallet 中确认交易，然后回到这里确认支付状态。
                </p>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex space-x-3">
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              disabled={isConfirming}
            >
              取消支付
            </button>
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isConfirming ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>处理中...</span>
                </div>
              ) : (
                "我已完成支付"
              )}
            </button>
          </div>

          {/* 帮助信息 */}
          <div className="mt-4 text-xs text-gray-500 text-center">
            如果 Trust Wallet 没有自动打开，请手动打开 Trust Wallet 应用
          </div>
        </div>
      </div>
    </div>
  );
};
