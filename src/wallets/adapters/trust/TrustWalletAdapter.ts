/**
 * Trust Wallet 适配器 - WalletConnect v2 实现
 *
 * 使用 WalletConnect v2 Universal Provider 实现真实的钱包连接和交易签名
 * 提供完整的回调机制和会话管理
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
  WalletConnectConfig,
  WalletConnectSession,
} from "./types";
import { TRUST_WALLET_CONSTANTS } from "./constants";
import UniversalProvider from "@walletconnect/universal-provider";
import { WalletConnectModal } from "@walletconnect/modal";

// 本地存储键名
const TRUST_WALLET_SESSION_KEY = "trust_wallet_wc_session";
const TRUST_WALLET_STATE_KEY = "trust_wallet_state";

export class TrustWalletAdapter implements WalletAdapter {
  private state: TrustWalletState;
  private universalProvider: UniversalProvider | null = null;
  private walletConnectModal: WalletConnectModal | null = null;
  private session: WalletConnectSession | null = null;
  private config: WalletConnectConfig;

  constructor() {
    this.config = {
      projectId: TRUST_WALLET_CONSTANTS.WALLETCONNECT.PROJECT_ID,
      metadata: TRUST_WALLET_CONSTANTS.WALLETCONNECT.METADATA,
    };

    this.state = {
      isConnected: false,
      isInstalled: true, // WalletConnect 不需要检测安装
      isConnecting: false,
      address: undefined,
      balance: undefined,
      error: undefined,
      wcSession: undefined,
      wcUri: undefined,
    };

    // 尝试恢复会话
    this.restoreSession();
  }

  /**
   * 初始化 WalletConnect Universal Provider
   */
  private async initializeProvider(): Promise<void> {
    if (this.universalProvider) {
      return;
    }

    try {
      // 验证配置
      if (!this.config.projectId) {
        throw new Error("WalletConnect Project ID is required");
      }

      // 初始化 Universal Provider
      this.universalProvider = await UniversalProvider.init({
        logger: "warn",
        projectId: this.config.projectId,
        metadata: this.config.metadata,
      });

      // 初始化 Modal
      this.walletConnectModal = new WalletConnectModal({
        projectId: this.config.projectId,
        chains: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
      });

      // 设置事件监听器
      this.setupEventListeners();

      console.log("[TrustWalletAdapter] WalletConnect provider initialized");
    } catch (error) {
      console.error(
        "[TrustWalletAdapter] Failed to initialize provider:",
        error
      );
      this.state.error =
        TRUST_WALLET_CONSTANTS.ERRORS.WALLETCONNECT_INIT_FAILED;
      throw error;
    }
  }

  /**
   * 设置 WalletConnect 事件监听器
   */
  private setupEventListeners(): void {
    if (!this.universalProvider) return;

    // 显示 URI (QR 码)
    this.universalProvider.on("display_uri", (uri: string) => {
      console.log("[TrustWalletAdapter] WalletConnect URI:", uri);
      this.state.wcUri = uri;
      // 打开 Modal 显示 QR 码
      if (this.walletConnectModal) {
        this.walletConnectModal.openModal({ uri });
      }
    });

    // 会话连接成功
    this.universalProvider.on("session_update", (session: any) => {
      console.log("[TrustWalletAdapter] Session updated:", session);
      this.handleSessionUpdate(session);
    });

    // 会话删除/断开
    this.universalProvider.on("session_delete", (session: any) => {
      console.log("[TrustWalletAdapter] Session deleted:", session);
      this.handleSessionDelete();
    });

    // 连接事件
    this.universalProvider.on("connect", (session: any) => {
      console.log("[TrustWalletAdapter] Connected:", session);
      this.handleSessionConnect(session);
    });

    // 断开事件
    this.universalProvider.on("disconnect", (session: any) => {
      console.log("[TrustWalletAdapter] Disconnected:", session);
      this.handleSessionDelete();
    });
  }

  /**
   * 处理会话连接
   */
  private handleSessionConnect(session: any): void {
    // WalletConnect v2 session 结构包含 namespaces
    if (session?.namespaces?.solana?.accounts?.length > 0) {
      const account = session.namespaces.solana.accounts[0];
      // 从账户字符串中提取地址 (格式: "solana:chainId:address")
      const address = account.split(":")[2];

      this.session = {
        topic: session.topic,
        accounts: [address],
        chains: session.namespaces.solana.chains,
        expiry: session.expiry,
      };

      this.state = {
        ...this.state,
        isConnected: true,
        isConnecting: false,
        address: address,
        wcSession: session,
        error: undefined,
      };

      // 保存会话状态
      this.saveSession();

      // 关闭 Modal
      if (this.walletConnectModal) {
        this.walletConnectModal.closeModal();
      }

      console.log(
        "[TrustWalletAdapter] Connection successful, address:",
        address
      );
    }
  }

  /**
   * 处理会话更新
   */
  private handleSessionUpdate(session: any): void {
    // WalletConnect v2 session 结构包含 namespaces
    if (session?.namespaces?.solana?.accounts?.length > 0) {
      const account = session.namespaces.solana.accounts[0];
      const address = account.split(":")[2];

      this.state = {
        ...this.state,
        address: address,
        wcSession: session,
      };

      this.saveSession();
    }
  }

  /**
   * 处理会话删除
   */
  private handleSessionDelete(): void {
    this.session = null;
    this.state = {
      ...this.state,
      isConnected: false,
      isConnecting: false,
      address: undefined,
      wcSession: undefined,
      wcUri: undefined,
    };

    this.clearSession();
    console.log("[TrustWalletAdapter] Session cleared");
  }

  /**
   * 连接到 Trust Wallet
   */
  async connect(_options?: TrustWalletConnectionOptions): Promise<void> {
    if (this.state.isConnecting) {
      throw new Error("Connection already in progress");
    }

    if (this.state.isConnected) {
      return;
    }

    this.state.isConnecting = true;
    this.state.error = undefined;

    try {
      // 初始化 Provider
      await this.initializeProvider();

      if (!this.universalProvider) {
        throw new Error("Failed to initialize Universal Provider");
      }

      // 连接钱包
      await this.universalProvider.connect({
        namespaces: TRUST_WALLET_CONSTANTS.WALLETCONNECT.SOLANA_NAMESPACE,
        skipPairing: false,
      });

      // 连接状态会在事件监听器中更新
      console.log("[TrustWalletAdapter] Connection initiated");

      // 关闭 wallet selector 的 modal
      if (this.walletConnectModal) {
        this.walletConnectModal.closeModal();
      }
    } catch (error) {
      this.state.error =
        error instanceof Error ? error.message : "Connection failed";
      this.state.isConnecting = false;

      // 关闭 Modal
      if (this.walletConnectModal) {
        this.walletConnectModal.closeModal();
      }

      console.error("[TrustWalletAdapter] Connection failed:", error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    try {
      if (this.universalProvider && this.session) {
        await this.universalProvider.disconnect();
      }

      // 清理状态
      this.handleSessionDelete();

      // 关闭 Modal
      if (this.walletConnectModal) {
        this.walletConnectModal.closeModal();
      }

      console.log("[TrustWalletAdapter] Disconnected successfully");
    } catch (error) {
      console.error("[TrustWalletAdapter] Disconnect failed:", error);
      // 即使断开失败，也清理本地状态
      this.handleSessionDelete();
    }
  }

  /**
   * 签名并发送交易
   */
  async signAndSendTransaction(transaction: Transaction): Promise<string> {
    if (!this.state.isConnected || !this.universalProvider || !this.session) {
      throw new Error(TRUST_WALLET_CONSTANTS.ERRORS.NO_SESSION);
    }

    try {
      // 序列化交易
      const serializedTx = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      // 构建请求参数
      const params = {
        transaction: Buffer.from(serializedTx).toString("base64"),
      };

      // 发送签名并发送交易请求
      const result = await this.universalProvider.request(
        {
          method: "solana_signAndSendTransaction",
          params: params,
        },
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
      );

      if (typeof result === "string") {
        console.log(
          "[TrustWalletAdapter] Transaction sent successfully:",
          result
        );
        return result;
      } else if (
        result &&
        typeof result === "object" &&
        "signature" in result
      ) {
        return (result as { signature: string }).signature;
      } else {
        throw new Error("Invalid transaction response format");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Transaction failed";
      this.state.error = errorMessage;
      console.error("[TrustWalletAdapter] Transaction failed:", error);
      throw new Error(errorMessage);
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    const connected = this.state.isConnected;
    console.log(
      `[TrustWalletAdapter] isConnected() returning: ${connected}, address: ${this.state.address}`
    );
    return connected;
  }

  /**
   * 获取公钥
   */
  getPublicKey(): string | null {
    const publicKey = this.state.address || null;
    console.log(`[TrustWalletAdapter] getPublicKey() returning: ${publicKey}`);
    return publicKey;
  }

  /**
   * 处理回调 (主要用于兼容现有接口)
   */
  async handleCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    try {
      // WalletConnect 通过事件处理回调，这里主要用于兼容
      if (params.type === "connect" && this.state.isConnected) {
        return {
          type: "connect",
          success: true,
          data: { address: this.state.address },
        };
      } else if (params.type === "transaction" && params.signature) {
        return {
          type: "transaction",
          success: true,
          data: { signature: params.signature },
        };
      }

      return {
        type: params.type || "unknown",
        success: false,
        error: "Unknown callback type or invalid state",
      };
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
   * 保存会话到本地存储
   */
  private saveSession(): void {
    try {
      if (this.session) {
        localStorage.setItem(
          TRUST_WALLET_SESSION_KEY,
          JSON.stringify(this.session)
        );
      }
      localStorage.setItem(
        TRUST_WALLET_STATE_KEY,
        JSON.stringify({
          isConnected: this.state.isConnected,
          address: this.state.address,
        })
      );
    } catch (error) {
      console.warn("[TrustWalletAdapter] Failed to save session:", error);
    }
  }

  /**
   * 从本地存储恢复会话
   */
  private restoreSession(): void {
    try {
      const sessionData = localStorage.getItem(TRUST_WALLET_SESSION_KEY);
      const stateData = localStorage.getItem(TRUST_WALLET_STATE_KEY);

      if (sessionData && stateData) {
        this.session = JSON.parse(sessionData);
        const savedState = JSON.parse(stateData);

        this.state = {
          ...this.state,
          isConnected: savedState.isConnected,
          address: savedState.address,
        };

        console.log("[TrustWalletAdapter] Session restored from storage");

        // 如果有保存的会话，尝试重新连接到 WalletConnect
        if (savedState.isConnected && this.session) {
          this.reconnectToSession();
        }
      }
    } catch (error) {
      console.warn("[TrustWalletAdapter] Failed to restore session:", error);
      this.clearSession();
    }
  }

  /**
   * 重新连接到已保存的 WalletConnect 会话
   */
  private async reconnectToSession(): Promise<void> {
    try {
      if (!this.session) {
        return;
      }

      console.log("[TrustWalletAdapter] Attempting to reconnect to session...");

      // 初始化 Provider (如果尚未初始化)
      await this.initializeProvider();

      if (!this.universalProvider) {
        throw new Error("Failed to initialize Universal Provider");
      }

      // 检查会话是否仍然存在于 UniversalProvider 中
      // UniversalProvider.session 是一个单一的会话对象，如果存在的话
      if (
        this.universalProvider.session &&
        this.universalProvider.session.topic === this.session.topic
      ) {
        // 会话仍然有效，更新状态
        console.log(
          "[TrustWalletAdapter] Existing session found, reconnecting..."
        );
        this.handleSessionConnect(this.universalProvider.session);
      } else {
        // 会话已过期或不存在，清理本地状态
        console.log(
          "[TrustWalletAdapter] Session expired, clearing local state"
        );
        this.handleSessionDelete();
      }
    } catch (error) {
      console.warn(
        "[TrustWalletAdapter] Failed to reconnect to session:",
        error
      );
      // 连接失败，清理本地状态
      this.handleSessionDelete();
    }
  }

  /**
   * 清理会话存储
   */
  private clearSession(): void {
    try {
      localStorage.removeItem(TRUST_WALLET_SESSION_KEY);
      localStorage.removeItem(TRUST_WALLET_STATE_KEY);
    } catch (error) {
      console.warn("[TrustWalletAdapter] Failed to clear session:", error);
    }
  }

  /**
   * 手动尝试重新连接到保存的会话（用于调试和恢复）
   */
  async tryReconnect(): Promise<void> {
    console.log("[TrustWalletAdapter] Manual reconnection attempt...");

    // 如果已经连接，不需要重新连接
    if (this.state.isConnected) {
      console.log(
        "[TrustWalletAdapter] Already connected, skipping reconnection"
      );
      return;
    }

    // 尝试从本地存储恢复并重新连接
    await this.reconnectToSession();
  }
}
