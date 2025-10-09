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
import { SecurityMonitor } from "@/wallets/utils/securityMonitor";
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
  TRANSACTION_TIMEOUT,
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
    // 尝试恢复 session
    this.restoreSession();
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

      // 2. 初始化 SignClient
      if (!this.signClient) {
        WalletLogger.log(LogLevel.INFO, "trust", "initSignClient");

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
      }

      // 3. 创建连接请求
      WalletLogger.log(LogLevel.INFO, "trust", "createConnectRequest");

      const { uri, approval } = await this.signClient.connect({
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
    let isInSigningFlow = false;

    try {
      // 1. 检查连接状态
      if (!this.connected || !this.session || !this.signClient) {
        throw new WalletError(
          WalletErrorCode.NOT_CONNECTED,
          "Wallet not connected. Please connect first.",
          false
        );
      }

      // 2. 验证交易
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

      // 3. 安全检查：仅在页面可见时允许签名
      if (document.visibilityState !== "visible") {
        throw new WalletError(
          WalletErrorCode.UNSUPPORTED_OPERATION,
          "Cannot sign transaction when page is not visible",
          false
        );
      }

      // 4. 设置签名流程标志
      isInSigningFlow = true;

      // 5. 监听页面可见性（防钓鱼）
      const visibilityHandler = () => {
        if (document.visibilityState === "hidden" && isInSigningFlow) {
          WalletLogger.log(LogLevel.WARN, "trust", "pageHiddenDuringSigning", {
            suspicious: true,
          });

          // 记录可疑活动
          SecurityMonitor.recordSuspiciousActivity(
            "page_hidden_during_signing",
            {
              walletType: "trust",
              action: "signTransaction",
            }
          );
        }
      };
      document.addEventListener("visibilitychange", visibilityHandler);

      try {
        // 6. 序列化交易
        const serializedTransaction = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });

        WalletLogger.log(LogLevel.INFO, "trust", "requestSignature", {
          txSize: serializedTransaction.length,
        });

        // 7. 创建超时 Promise
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new WalletError(
                  WalletErrorCode.TRANSACTION_FAILED,
                  "Transaction signing timeout"
                )
              ),
            TRANSACTION_TIMEOUT
          )
        );

        // 8. 发送签名请求（带超时）
        const resultPromise = this.signClient.request<{ signature: string }>({
          topic: this.session.topic,
          chainId: SOLANA_MAINNET_CHAIN_ID,
          request: {
            method: SOLANA_METHODS.SIGN_TRANSACTION,
            params: {
              transaction: Buffer.from(serializedTransaction).toString(
                "base64"
              ),
            },
          },
        });

        const result = await Promise.race([resultPromise, timeoutPromise]);

        // 9. 解析签名结果
        // WalletConnect Solana 返回 base64 编码的签名交易
        const signatureData =
          typeof result === "string" ? result : result.signature || "";

        const signedTransaction = Transaction.from(
          Buffer.from(signatureData, "base64")
        );

        const duration = Date.now() - startTime;
        WalletLogger.logSignature("trust", true, duration);

        return signedTransaction;
      } finally {
        isInSigningFlow = false;
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
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
   * 处理回调
   */
  async handleCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    try {
      WalletLogger.log(LogLevel.INFO, "trust", "handleCallback", { params });

      // Trust Wallet 使用 WalletConnect 事件驱动
      // URL 回调通常不需要特殊处理
      // 大部分通信通过 WalletConnect session 完成

      // 检查是否有错误参数
      if (params.errorCode) {
        return {
          type: "error",
          success: false,
          error: params.errorMessage || "Unknown error",
        };
      }

      // 正常情况，session 已通过事件更新
      return {
        type: "info",
        success: true,
        data: { message: "Callback received" },
      };
    } catch (error) {
      return {
        type: "error",
        success: false,
        error: (error as Error).message,
      };
    }
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
}
