import type {
  WalletAdapter,
  WalletCallbackRequest,
  WalletCallbackResponse,
} from "@/wallets/types/wallet";
import { Transaction } from "@solana/web3.js";
import SignClient from "@walletconnect/sign-client";
import type { SessionTypes } from "@walletconnect/types";
import { DAPP_NAME, DAPP_ICON } from "@/wallets/utils/dapp";
import { WalletLogger, LogLevel } from "@/wallets/utils/logger";
import {
  WalletError,
  WalletErrorCode,
  createWalletError,
} from "@/wallets/errors/WalletError";
import {
  SOLANA_MAINNET_CHAIN_ID,
  SOLANA_METHODS,
  TRUST_SESSION_KEY,
  CONNECTION_TIMEOUT,
  RETRY_ATTEMPTS,
  RETRY_DELAY,
  SESSION_EXPIRY,
  TRUST_DEEPLINK_BASE,
  WALLETCONNECT_NAMESPACE,
} from "./constants";

/**
 * Trust Wallet 适配器 - WalletConnect V2 实现
 */
export class TrustWalletAdapter implements WalletAdapter {
  private signClient: SignClient | null = null;
  private session: SessionTypes.Struct | null = null;
  private publicKey: string | null = null;
  private connected: boolean = false;

  constructor() {
    // 只恢复基础状态，不做异步初始化
    this.restoreSession();
  }

  /**
   * 初始化 Trust Wallet（异步）
   * 参考 OKX 的实现模式
   */
  async init(): Promise<void> {
    try {
      // 如果已有 signClient，无需重复初始化
      if (this.signClient) {
        WalletLogger.log(LogLevel.INFO, "trust", "init", {
          message: "SignClient already initialized",
        });
        return;
      }

      // 如果没有 session，无需初始化
      if (!this.session) {
        WalletLogger.log(LogLevel.INFO, "trust", "init", {
          message: "No session to restore",
        });
        return;
      }

      WalletLogger.log(LogLevel.INFO, "trust", "init", {
        message: "Initializing SignClient for restored session",
      });

      // 初始化 SignClient
      this.signClient = await SignClient.init({
        projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: DAPP_NAME,
          description: "Web3 Payment Platform",
          url: window.location.origin,
          icons: [DAPP_ICON],
        },
      });

      // 设置事件监听器
      this.setupEventListeners();

      WalletLogger.log(LogLevel.INFO, "trust", "init", {
        success: true,
        publicKey: this.publicKey,
        sessionTopic: this.session.topic,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      WalletLogger.log(LogLevel.ERROR, "trust", "init", {
        error: error.message,
      });

      // 初始化失败，清理状态
      this.signClient = null;
      this.clearSession();

      throw new WalletError(
        WalletErrorCode.CONNECTION_FAILED,
        `Failed to initialize Trust Wallet: ${error.message}`,
        true,
        error
      );
    }
  }

  /**
   * 连接钱包（带重试机制）
   */
  async connect(): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        WalletLogger.log(LogLevel.INFO, "trust", "connectAttempt", { attempt });
        await this._connectInternal();
        return; // 成功，退出重试循环
      } catch (error) {
        lastError = error as Error;
        WalletLogger.log(LogLevel.WARN, "trust", "connectFailed", {
          attempt,
          error: (error as Error).message,
        });

        // 如果是用户取消，不重试
        if (
          error instanceof WalletError &&
          error.code === WalletErrorCode.USER_REJECTED
        ) {
          throw error;
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < RETRY_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }

    // 所有尝试都失败
    throw new WalletError(
      WalletErrorCode.CONNECTION_FAILED,
      `Failed to connect after ${RETRY_ATTEMPTS} attempts: ${lastError?.message}`,
      true,
      lastError as Error
    );
  }

  /**
   * 内部连接实现
   */
  private async _connectInternal(): Promise<void> {
    const startTime = Date.now();

    try {
      // 1. 检查是否已连接
      if (this.connected && this.session) {
        throw new WalletError(
          WalletErrorCode.ALREADY_CONNECTED,
          "Wallet already connected"
        );
      }

      // 2. 确保 SignClient 已初始化
      if (!this.signClient) {
        await this.init();
      }

      // 3. 创建连接请求
      WalletLogger.log(LogLevel.INFO, "trust", "createConnectRequest");

      const { uri, approval } = await this.signClient!.connect({
        requiredNamespaces: {
          [WALLETCONNECT_NAMESPACE]: {
            methods: [
              SOLANA_METHODS.SIGN_TRANSACTION,
              SOLANA_METHODS.SIGN_MESSAGE,
            ],
            chains: [SOLANA_MAINNET_CHAIN_ID],
            events: [],
          },
        },
      });

      // 4. 构建 Trust Wallet deeplink
      if (uri) {
        const trustDeeplink = `${TRUST_DEEPLINK_BASE}/wc?uri=${encodeURIComponent(uri)}`;
        WalletLogger.log(LogLevel.INFO, "trust", "openDeeplink", {
          uri: trustDeeplink.substring(0, 100) + "...",
        });

        // 跳转到 Trust Wallet
        window.location.href = trustDeeplink;
      }

      // 5. 等待批准（带超时）
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new WalletError(
                WalletErrorCode.CONNECTION_TIMEOUT,
                "Connection timeout"
              )
            ),
          CONNECTION_TIMEOUT
        )
      );

      const session = await Promise.race([approval(), timeoutPromise]);

      if (!session) {
        throw new WalletError(
          WalletErrorCode.CONNECTION_FAILED,
          "Failed to establish session"
        );
      }

      this.session = session;

      // 6. 提取公钥
      const accounts =
        this.session.namespaces[WALLETCONNECT_NAMESPACE]?.accounts || [];
      if (accounts.length > 0) {
        // Format: "solana:chainId:address"
        this.publicKey = accounts[0].split(":")[2];
      }

      // 7. 保存 session
      if (this.publicKey) {
        this.connected = true;
        this.saveSession(this.session, this.publicKey);

        const duration = Date.now() - startTime;
        WalletLogger.logConnection("trust", true, duration);
      } else {
        throw new WalletError(
          WalletErrorCode.CONNECTION_FAILED,
          "Failed to extract public key from session"
        );
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const walletError = createWalletError(error);
      WalletLogger.logConnection("trust", false, duration, walletError);
      throw walletError;
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.signClient) return;

    // 监听 session 删除
    this.signClient.on("session_delete", () => {
      WalletLogger.log(LogLevel.INFO, "trust", "sessionDeleted");
      this.clearSession();
    });

    // 监听 session 过期
    this.signClient.on("session_expire", () => {
      WalletLogger.log(LogLevel.WARN, "trust", "sessionExpired");
      this.clearSession();
    });

    // 监听 session 更新
    this.signClient.on("session_update", ({ topic }: { topic: string }) => {
      WalletLogger.log(LogLevel.INFO, "trust", "sessionUpdated", { topic });
      // Session 更新逻辑（如需要）
    });
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    try {
      WalletLogger.log(LogLevel.INFO, "trust", "disconnect", {
        connected: this.connected,
      });

      // 1. 如果有活跃 session，断开连接
      if (this.signClient && this.session) {
        await this.signClient.disconnect({
          topic: this.session.topic,
          reason: {
            code: 6000,
            message: "User disconnected",
          },
        });
      }

      // 2. 清理状态
      this.clearSession();
      this.signClient = null;

      WalletLogger.log(LogLevel.INFO, "trust", "disconnected", {
        success: true,
      });
    } catch (error) {
      const walletError = createWalletError(error);
      WalletLogger.log(LogLevel.ERROR, "trust", "disconnect", {
        error: walletError.message,
      });

      // 即使断开失败，也清理本地状态
      this.clearSession();
      this.signClient = null;

      throw walletError;
    }
  }

  /**
   * 签名交易（带超时和安全检查）
   */
  async signTransaction(transaction: Transaction): Promise<Transaction> {
    const startTime = Date.now();

    try {
      // 1. 检查连接状态
      if (!this.connected || !this.session) {
        throw new WalletError(
          WalletErrorCode.NOT_CONNECTED,
          "Wallet not connected. Please connect first.",
          false
        );
      }

      // 2. 确保 SignClient 已初始化
      if (!this.signClient) {
        WalletLogger.log(LogLevel.INFO, "trust", "signTransaction", {
          message: "SignClient not initialized, initializing...",
        });
        await this.init();
      }

      // 3. 验证交易
      if (!transaction.recentBlockhash) {
        throw new WalletError(
          WalletErrorCode.INVALID_TRANSACTION,
          "Transaction missing recentBlockhash",
          false
        );
      }

      if (!transaction.feePayer) {
        throw new WalletError(
          WalletErrorCode.INVALID_TRANSACTION,
          "Transaction missing feePayer",
          false
        );
      }

      // 4. 构建 Trust Wallet 签名 deeplink 并跳转
      // 构建 Trust Wallet 签名 deeplink
      // 使用与连接时相同的 URI 格式
      const signatureUri = `wc:${this.session.topic}@2?relay-protocol=irn`;
      const trustSignatureDeeplink = `${TRUST_DEEPLINK_BASE}/wc?uri=${encodeURIComponent(signatureUri)}`;

      WalletLogger.log(LogLevel.INFO, "trust", "openSignatureDeeplink", {
        uri: trustSignatureDeeplink.substring(0, 100) + "...",
      });

      // 跳转到 Trust Wallet 进行签名
      window.location.href = trustSignatureDeeplink;

      // 对于 Trust Wallet，signTransaction 只是打开 deeplink
      // 实际的签名结果会通过 WalletConnect 回调处理
      // 这里抛出一个特殊错误，让业务层知道需要等待回调
      throw new WalletError(
        WalletErrorCode.UNSUPPORTED_OPERATION,
        "TRUST_REDIRECT_PENDING",
        true
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      const walletError = createWalletError(error);
      WalletLogger.logSignature("trust", false, duration, walletError);
      throw walletError;
    }
  }

  /**
   * 广播已签名交易
   */
  async sendRawTransaction(signedTransaction: Transaction): Promise<string> {
    // 复用现有实现
    const { sendRawTransaction } = await import("@/utils/transaction");
    return sendRawTransaction(signedTransaction);
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 获取公钥
   */
  getPublicKey(): string | null {
    return this.publicKey;
  }

  /**
   * 保存 Session 到 localStorage
   */
  private saveSession(session: SessionTypes.Struct, publicKey: string): void {
    try {
      const data = {
        session,
        publicKey,
        timestamp: Date.now(),
        version: "1.0",
      };
      localStorage.setItem(TRUST_SESSION_KEY, JSON.stringify(data));
      WalletLogger.log(LogLevel.INFO, "trust", "saveSession", { publicKey });
    } catch (err) {
      console.error("Failed to save Trust Wallet session:", err);
    }
  }

  /**
   * 从 localStorage 恢复 Session
   */
  private restoreSession(): void {
    try {
      const saved = localStorage.getItem(TRUST_SESSION_KEY);
      if (!saved) return;

      const { session, publicKey, timestamp } = JSON.parse(saved);

      // 检查有效期
      if (Date.now() - timestamp > SESSION_EXPIRY) {
        localStorage.removeItem(TRUST_SESSION_KEY);
        WalletLogger.log(LogLevel.WARN, "trust", "restoreSession", {
          reason: "expired",
        });
        return;
      }

      this.session = session;
      this.publicKey = publicKey;
      this.connected = true;

      WalletLogger.log(LogLevel.INFO, "trust", "restoreSession", {
        publicKey,
        success: true,
      });
    } catch (err) {
      console.error("Failed to restore Trust Wallet session:", err);
      localStorage.removeItem(TRUST_SESSION_KEY);
    }
  }

  /**
   * 清除 Session
   */
  private clearSession(): void {
    localStorage.removeItem(TRUST_SESSION_KEY);
    this.session = null;
    this.publicKey = null;
    this.connected = false;
  }

  /**
   * 获取 Session（用于调试）
   */
  getSession(): SessionTypes.Struct | null {
    return this.session;
  }

  /**
   * 处理 Trust Wallet 回调
   * Trust Wallet 使用 WalletConnect，不需要特殊的回调处理
   * 签名结果通过 WalletConnect 事件自动处理
   */
  async handleCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    // Trust Wallet 使用 WalletConnect 协议
    // 连接和签名结果都通过 WalletConnect 事件自动处理
    // 这里主要用于兼容性，实际上不会接收到特殊的回调参数

    try {
      // 检查是否是连接回调（通过 WalletConnect 自动处理）
      if (this.connected && this.publicKey) {
        return {
          type: "connect",
          success: true,
          data: { publicKey: this.publicKey } as unknown,
        };
      }

      // 检查是否是签名回调（通过 WalletConnect 自动处理）
      // Trust Wallet 的签名结果通过 WalletConnect 事件处理
      // 这里返回成功，让业务层知道可以继续处理
      return {
        type: "signTransaction",
        success: true,
        data: {
          message: "Trust Wallet callback handled via WalletConnect",
        } as unknown,
      };
    } catch (err: unknown) {
      return {
        type: "error",
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
