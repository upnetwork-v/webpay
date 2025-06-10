/**
 * Trust Wallet Deep Link 适配器
 *
 * 使用 Deep Link 方式唤起 Trust Wallet 进行支付
 * 不支持获取用户地址，只能模拟连接状态
 */
import type {
  WalletAdapter,
  PaymentRequest,
  WalletCallbackRequest,
  WalletCallbackResponse,
} from "../../types/wallet";

import { formatUnits } from "viem";

// 待确认错误类型
export class PendingConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PendingConfirmationError";
  }
}

// Trust Wallet 状态
interface TrustWalletState {
  isConnected: boolean;
  address?: string;
  pendingPayment?: PaymentRequest;
  error?: string;
}

// 本地存储键名
const TRUST_WALLET_STATE_KEY = "trust_wallet_deeplink_state";

export class TrustWalletDeepLinkAdapter implements WalletAdapter {
  private state: TrustWalletState;

  constructor() {
    this.state = {
      isConnected: false,
      address: undefined,
      pendingPayment: undefined,
      error: undefined,
    };

    // 尝试从本地存储恢复状态
    this.restoreState();
  }

  /**
   * 模拟连接 - Trust Wallet Deep Link 无法获取用户地址
   */
  async connect(): Promise<void> {
    try {
      // 检查是否在移动设备上
      if (!this.isMobileDevice()) {
        throw new Error("Trust Wallet Deep Link only works on mobile devices");
      }

      // 模拟连接状态
      this.state = {
        ...this.state,
        isConnected: true,
        error: undefined,
      };

      this.saveState();
      console.log(
        "[TrustWalletDeepLinkAdapter] Connection simulated successfully"
      );
    } catch (error) {
      this.state.error =
        error instanceof Error ? error.message : "Connection failed";
      console.error("[TrustWalletDeepLinkAdapter] Connection failed:", error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.state = {
      isConnected: false,
      address: undefined,
      pendingPayment: undefined,
      error: undefined,
    };

    this.clearState();
    console.log("[TrustWalletDeepLinkAdapter] Disconnected successfully");
  }

  /**
   * 发送支付请求 - 通过 Deep Link 唤起 Trust Wallet
   */
  async signAndSendTransaction(request: PaymentRequest): Promise<string> {
    if (!this.state.isConnected) {
      throw new Error("Wallet not connected");
    }

    try {
      // 构建 Deep Link
      const deepLink = this.buildPaymentDeepLink(request);

      // 保存待确认的支付信息
      this.state.pendingPayment = request;
      this.saveState();

      console.log(
        "[TrustWalletDeepLinkAdapter] Opening Trust Wallet with deep link:",
        deepLink
      );

      // 打开 Trust Wallet
      window.location.href = deepLink;

      // 抛出待确认错误，让上层处理确认流程
      throw new PendingConfirmationError(
        "Payment initiated, awaiting user confirmation"
      );
    } catch (error) {
      if (error instanceof PendingConfirmationError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : "Payment failed";
      this.state.error = errorMessage;
      console.error("[TrustWalletDeepLinkAdapter] Payment failed:", error);
      throw new Error(errorMessage);
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.state.isConnected;
  }

  /**
   * 获取公钥 - Trust Wallet Deep Link 无法获取
   */
  getPublicKey(): string | null {
    return this.state.address || null;
  }

  /**
   * 设置用户地址（由外部提供）
   */
  setUserAddress(address: string): void {
    this.state.address = address;
    this.saveState();
    console.log("[TrustWalletDeepLinkAdapter] User address set:", address);
  }

  /**
   * 确认支付完成
   */
  confirmPaymentCompleted(): void {
    this.state.pendingPayment = undefined;
    this.saveState();
    console.log("[TrustWalletDeepLinkAdapter] Payment confirmed as completed");
  }

  /**
   * 获取待确认的支付信息
   */
  getPendingPayment(): PaymentRequest | undefined {
    return this.state.pendingPayment;
  }

  /**
   * 处理回调 (兼容接口)
   */
  async handleCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    if (params.type === "connect" && this.state.isConnected) {
      return {
        type: "connect",
        success: true,
        data: { address: this.state.address },
      };
    }

    return {
      type: params.type || "unknown",
      success: false,
      error: "Trust Wallet Deep Link does not support callbacks",
    };
  }

  /**
   * 构建支付 Deep Link
   */
  private buildPaymentDeepLink(request: PaymentRequest): string {
    const params = new URLSearchParams({
      asset: this.getAssetIdentifier(request.tokenMint),
      address: request.recipientAddress,
      amount: formatUnits(BigInt(request.amount), request.decimal),
      memo: `webpay_orderId_${request.orderId}`,
    });

    return `https://link.trustwallet.com/send?${params.toString()}`;
  }

  /**
   * 获取资产标识符
   * 参考：https://developer.trustwallet.com/developer/develop-for-trust/deeplinking#send-payment
   */
  private getAssetIdentifier(tokenMint?: string): string {
    const SOLANA_SLIP44 = "c501";

    if (
      !tokenMint ||
      tokenMint === "So11111111111111111111111111111111111111112"
    ) {
      // Native SOL
      return SOLANA_SLIP44;
    }

    // SPL Token format: c{slip44}_t{mint_address}
    return `${SOLANA_SLIP44}_t${tokenMint}`;
  }

  /**
   * 检查是否为移动设备
   */
  private isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  /**
   * 保存状态到本地存储
   */
  private saveState(): void {
    try {
      localStorage.setItem(TRUST_WALLET_STATE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.warn("[TrustWalletDeepLinkAdapter] Failed to save state:", error);
    }
  }

  /**
   * 从本地存储恢复状态
   */
  private restoreState(): void {
    try {
      const savedState = localStorage.getItem(TRUST_WALLET_STATE_KEY);
      if (savedState) {
        this.state = { ...this.state, ...JSON.parse(savedState) };
        console.log("[TrustWalletDeepLinkAdapter] State restored from storage");
      }
    } catch (error) {
      console.warn(
        "[TrustWalletDeepLinkAdapter] Failed to restore state:",
        error
      );
      this.clearState();
    }
  }

  /**
   * 清理本地存储
   */
  private clearState(): void {
    try {
      localStorage.removeItem(TRUST_WALLET_STATE_KEY);
    } catch (error) {
      console.warn(
        "[TrustWalletDeepLinkAdapter] Failed to clear state:",
        error
      );
    }
  }

  /**
   * 获取当前状态
   */
  getState(): TrustWalletState {
    return { ...this.state };
  }
}
