/**
 * 支付管理器
 *
 * 统一处理不同钱包类型的支付逻辑
 * 特别处理 Trust Wallet Deep Link 的特殊流程
 */
import type { PaymentRequest, WalletType } from "@/wallets/types/wallet";
import { PendingConfirmationError } from "@/wallets/adapters/trust/TrustWalletDeepLinkAdapter";

// 支付结果类型
export interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  needsConfirmation?: boolean; // Trust Wallet Deep Link 需要用户确认
  paymentRequest?: PaymentRequest; // 待确认的支付请求
}

// 支付管理器类
export class PaymentManager {
  /**
   * 处理支付请求
   * @param walletType 钱包类型
   * @param signAndSendTransaction 钱包的支付方法
   * @param paymentRequest 支付请求
   * @returns 支付结果
   */
  static async processPayment(
    walletType: WalletType,
    signAndSendTransaction: (request: PaymentRequest) => Promise<string>,
    paymentRequest: PaymentRequest
  ): Promise<PaymentResult> {
    try {
      console.log(
        `[PaymentManager] Processing ${walletType} payment:`,
        paymentRequest
      );

      const transactionHash = await signAndSendTransaction(paymentRequest);

      return {
        success: true,
        transactionHash,
      };
    } catch (error) {
      console.error(`[PaymentManager] ${walletType} payment failed:`, error);

      // Trust Wallet Deep Link 特殊处理
      if (walletType === "trust" && error instanceof PendingConfirmationError) {
        return {
          success: false,
          needsConfirmation: true,
          paymentRequest,
          error: error.message,
        };
      }

      // 其他错误
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment failed",
      };
    }
  }

  /**
   * 格式化支付金额显示
   */
  static formatAmount(amount: string, tokenMint?: string): string {
    const tokenName = this.getTokenDisplayName(tokenMint);
    return `${amount} ${tokenName}`;
  }

  /**
   * 获取代币显示名称
   */
  static getTokenDisplayName(tokenMint?: string): string {
    if (
      !tokenMint ||
      tokenMint === "So11111111111111111111111111111111111111112"
    ) {
      return "SOL";
    }
    // 可以根据需要添加更多代币映射
    return "SPL Token";
  }

  /**
   * 格式化地址显示
   */
  static formatAddress(
    address: string,
    startLength = 6,
    endLength = 6
  ): string {
    if (address.length <= startLength + endLength) {
      return address;
    }
    return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
  }

  /**
   * 验证支付请求
   */
  static validatePaymentRequest(request: PaymentRequest): boolean {
    if (!request.recipientAddress || !request.amount || !request.orderId) {
      return false;
    }

    // 验证金额是否为正数
    const amount = parseFloat(request.amount);
    if (isNaN(amount) || amount <= 0) {
      return false;
    }

    // 验证地址格式（Solana 地址应该是 32-44 字符的 base58 字符串）
    if (
      request.recipientAddress.length < 32 ||
      request.recipientAddress.length > 44
    ) {
      return false;
    }

    return true;
  }

  /**
   * 创建支付请求
   */
  static createPaymentRequest(
    recipientAddress: string,
    amount: string,
    orderId: string,
    tokenMint?: string
  ): PaymentRequest {
    const request: PaymentRequest = {
      recipientAddress,
      amount,
      orderId,
    };

    if (tokenMint) {
      request.tokenMint = tokenMint;
    }

    return request;
  }

  /**
   * 检查是否为移动设备
   */
  static isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  /**
   * 检查钱包类型是否支持当前设备
   */
  static isWalletSupportedOnDevice(walletType: WalletType): boolean {
    switch (walletType) {
      case "trust":
        // Trust Wallet Deep Link 只在移动设备上支持
        return this.isMobileDevice();
      case "phantom":
      case "okx":
        // Phantom 和 OKX 在所有设备上都支持
        return true;
      default:
        return false;
    }
  }

  /**
   * 获取钱包类型的显示名称
   */
  static getWalletDisplayName(walletType: WalletType): string {
    switch (walletType) {
      case "phantom":
        return "Phantom";
      case "okx":
        return "OKX Wallet";
      case "trust":
        return "Trust Wallet";
      default:
        return "Unknown Wallet";
    }
  }
}
