/**
 * Trust Wallet 适配器
 *
 * 实现基于 Deep Linking 的 Trust Wallet 集成
 */
import type { Transaction } from "@solana/web3.js";
import type {
  WalletAdapter,
  WalletCallbackRequest,
  WalletCallbackResponse,
} from "../../types/wallet";
import type {
  TrustWalletState,
  TrustWalletConnectionOptions,
  PaymentParams,
} from "./types";
import { TRUST_WALLET_CONSTANTS } from "./constants";
import { TrustWalletDetector } from "./detector";
import { TrustWalletDeepLink } from "./deeplink";

export class TrustWalletAdapter implements WalletAdapter {
  private state: TrustWalletState;
  private detector: TrustWalletDetector;
  private deepLink: TrustWalletDeepLink;
  private connectionTimeout?: NodeJS.Timeout;

  constructor() {
    this.state = {
      isConnected: false,
      isInstalled: false,
      isConnecting: false,
      address: undefined,
      balance: undefined,
      error: undefined,
    };

    this.detector = new TrustWalletDetector();
    this.deepLink = new TrustWalletDeepLink();

    // 初始化时检测 Trust Wallet
    this.initializeDetection();
  }

  /**
   * 初始化检测
   */
  private async initializeDetection(): Promise<void> {
    try {
      const detection = await this.detector.detectTrustWallet();
      this.state.isInstalled = detection.isInstalled;
    } catch (error) {
      console.warn("Trust Wallet detection failed:", error);
      this.state.isInstalled = false;
    }
  }

  /**
   * 连接到 Trust Wallet
   */
  async connect(options?: TrustWalletConnectionOptions): Promise<void> {
    if (this.state.isConnecting) {
      throw new Error("Connection already in progress");
    }

    if (this.state.isConnected) {
      return;
    }

    this.state.isConnecting = true;
    this.state.error = undefined;

    try {
      // 检测 Trust Wallet 支持情况
      const detection = await this.detector.detectTrustWallet();

      if (!detection.isInstalled && options?.showInstallGuide !== false) {
        await this.handleInstallationGuide();
        return;
      }

      // 使用 Deep Link 连接
      await this.connectViaDeepLink(options);
    } catch (error) {
      this.state.error =
        error instanceof Error ? error.message : "Unknown error";
      this.state.isConnecting = false;
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }

    this.state = {
      isConnected: false,
      isInstalled: this.state.isInstalled,
      isConnecting: false,
      address: undefined,
      balance: undefined,
      error: undefined,
    };
  }

  /**
   * 签名并发送交易
   */
  async signAndSendTransaction(transaction: Transaction): Promise<string> {
    if (!this.state.isConnected) {
      throw new Error("Wallet not connected");
    }

    if (!this.state.address) {
      throw new Error("No wallet address available");
    }

    try {
      // 构建支付参数
      const paymentParams: PaymentParams = {
        address: transaction.recentBlockhash || "", // 这里需要根据实际交易构建
        memo: "OntaPay Transaction",
        asset: TRUST_WALLET_CONSTANTS.SOLANA_ASSET_PREFIX,
      };

      // 验证支付参数
      const validation = this.deepLink.validatePaymentParams(paymentParams);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // 发起支付请求
      const success = await this.deepLink.requestPayment(paymentParams);

      if (!success) {
        throw new Error(TRUST_WALLET_CONSTANTS.ERRORS.TRANSACTION_FAILED);
      }

      // 等待交易确认 (这里需要实现交易状态监听)
      return await this.waitForTransactionConfirmation();
    } catch (error) {
      this.state.error =
        error instanceof Error ? error.message : "Transaction failed";
      throw error;
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.state.isConnected;
  }

  /**
   * 获取公钥
   */
  getPublicKey(): string | null {
    return this.state.address || null;
  }

  /**
   * 处理回调
   */
  async handleCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    try {
      // 根据回调类型处理
      if (params.type === "connect") {
        return await this.handleConnectCallback(params);
      } else if (params.type === "payment") {
        return await this.handlePaymentCallback(params);
      } else {
        return {
          type: params.type || "unknown",
          success: false,
          error: "Unknown callback type",
        };
      }
    } catch (error) {
      return {
        type: params.type || "unknown",
        success: false,
        error:
          error instanceof Error ? error.message : "Callback handling failed",
      };
    }
  }

  /**
   * 获取 Trust Wallet 状态
   */
  getState(): TrustWalletState {
    return { ...this.state };
  }

  /**
   * 通过 Deep Link 连接
   */
  private async connectViaDeepLink(
    options?: TrustWalletConnectionOptions
  ): Promise<void> {
    try {
      // 生成连接请求 URI
      const connectUri = this.generateConnectURI();

      // 通过 Deep Link 发起连接
      const success = await this.deepLink.requestConnection(connectUri);

      if (!success) {
        throw new Error(TRUST_WALLET_CONSTANTS.ERRORS.CONNECTION_FAILED);
      }

      // 设置连接超时
      const timeout =
        options?.timeout || TRUST_WALLET_CONSTANTS.CONNECTION_TIMEOUT;
      this.connectionTimeout = setTimeout(() => {
        this.state.isConnecting = false;
        this.state.error = TRUST_WALLET_CONSTANTS.ERRORS.TIMEOUT;
      }, timeout);

      // 等待连接确认
      await this.waitForConnectionConfirmation();
    } catch (error) {
      this.state.isConnecting = false;
      this.state.error =
        error instanceof Error ? error.message : "Deep Link connection failed";
      throw error;
    }
  }

  /**
   * 处理安装引导
   */
  private async handleInstallationGuide(): Promise<void> {
    const installUrl = "https://link.trustwallet.com";
    window.open(installUrl, "_blank", "noopener,noreferrer");
    throw new Error(TRUST_WALLET_CONSTANTS.ERRORS.NOT_INSTALLED);
  }

  /**
   * 生成连接 URI
   */
  private generateConnectURI(): string {
    // 这里生成一个简单的连接 URI
    // 实际应用中可能需要包含更多参数
    const params = new URLSearchParams({
      callback: window.location.href,
      dapp: "OntaPay",
    });

    return `trust://connect?${params.toString()}`;
  }

  /**
   * 等待连接确认
   */
  private async waitForConnectionConfirmation(): Promise<void> {
    // 这里需要实现连接状态监听
    // 临时模拟连接成功
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = undefined;
        }

        this.state.isConnecting = false;
        this.state.isConnected = true;
        this.state.address = "example-trust-wallet-address"; // 临时地址
        resolve();
      }, 2000);
    });
  }

  /**
   * 等待交易确认
   */
  private async waitForTransactionConfirmation(): Promise<string> {
    // 这里需要实现交易状态监听
    // 临时返回示例交易哈希
    return "example-transaction-hash";
  }

  /**
   * 处理连接回调
   */
  private async handleConnectCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    if (params.address) {
      this.state.isConnected = true;
      this.state.isConnecting = false;
      this.state.address = params.address;

      return {
        type: "connect",
        success: true,
        data: { address: params.address },
      };
    }

    return {
      type: "connect",
      success: false,
      error: "No address provided",
    };
  }

  /**
   * 处理支付回调
   */
  private async handlePaymentCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    if (params.signature) {
      return {
        type: "payment",
        success: true,
        data: { signature: params.signature },
      };
    }

    return {
      type: "payment",
      success: false,
      error: "No transaction signature provided",
    };
  }
}
