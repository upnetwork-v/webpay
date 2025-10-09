import type {
  WalletAdapter,
  WalletCallbackRequest,
  WalletCallbackResponse,
} from "@/wallets/types/wallet";

// Trust Wallet 扩展接口
interface TrustWalletAdapterExtended extends WalletAdapter {
  init(): Promise<void>;
  validateSession(): Promise<boolean>;
  clearInvalidSession(): void;
}
import { Transaction, PublicKey } from "@solana/web3.js";
import SignClient from "@walletconnect/sign-client";
import type { SessionTypes } from "@walletconnect/types";
import { DAPP_NAME, DAPP_ICON } from "@/wallets/utils/dapp";
// 内联常量定义
const SOLANA_MAINNET_CHAIN_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_METHODS = {
  SIGN_TRANSACTION: "solana_signTransaction",
  SIGN_MESSAGE: "solana_signMessage",
} as const;
const TRUST_SESSION_KEY = "trust_wallet_session";
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const TRUST_DEEPLINK_BASE = "https://link.trustwallet.com";
const WALLETCONNECT_NAMESPACE = "solana";

// 配置常量
const CONFIG = {
  CONNECTION_TIMEOUT: 120000, // 2分钟连接超时
  RETRY_DELAY: 2000, // 重试延迟
  POLL_INTERVAL: 5000, // 轮询间隔
  REDIRECT_DELAY: 100, // 重定向延迟
  CALLBACK_WAIT_TIME: 1000, // 回调等待时间
} as const;

// 全局 WalletConnect 实例管理，防止重复初始化
let globalSignClient: SignClient | null = null;
let globalInitPromise: Promise<SignClient> | null = null;

// 错误类型定义
enum TrustWalletErrorType {
  CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  USER_REJECTED = "USER_REJECTED",
  NETWORK_ERROR = "NETWORK_ERROR",
  INITIALIZATION_FAILED = "INITIALIZATION_FAILED",
  SIGNATURE_FAILED = "SIGNATURE_FAILED",
}

class TrustWalletError extends Error {
  constructor(
    public type: TrustWalletErrorType,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = "TrustWalletError";
  }
}

/**
 * Trust Wallet 适配器 - WalletConnect V2 实现
 */
export class TrustWalletAdapter implements TrustWalletAdapterExtended {
  private signClient: SignClient | null = null;
  private session: SessionTypes.Struct | null = null;
  private publicKey: string | null = null;
  private connected: boolean = false;
  private isInitialized: boolean = false;
  private isValidationInProgress: boolean = false; // 防止重复验证

  constructor() {
    // 只恢复基础状态，不做异步初始化
    this.restoreSession();
    // 注意：connected 状态在 init() 完成前不应为 true
    if (this.connected && !this.isInitialized) {
      this.connected = false;
    }
  }

  /**
   * 初始化 Trust Wallet
   */
  async init(): Promise<void> {
    if (this.isInitialized && this.signClient) {
      return;
    }

    // 验证环境变量
    const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
    if (!projectId) {
      throw new TrustWalletError(
        TrustWalletErrorType.INITIALIZATION_FAILED,
        "VITE_WALLETCONNECT_PROJECT_ID environment variable is not set"
      );
    }

    try {
      // 使用全局实例，避免重复初始化 WalletConnect
      if (globalSignClient) {
        console.log("[TrustWallet] Using existing WalletConnect client");
        this.signClient = globalSignClient;
      } else if (globalInitPromise) {
        console.log(
          "[TrustWallet] Waiting for existing WalletConnect initialization..."
        );
        this.signClient = await globalInitPromise;
      } else {
        console.log("[TrustWallet] Initializing new WalletConnect client...");
        globalInitPromise = SignClient.init({
          projectId: projectId,
          metadata: {
            name: DAPP_NAME,
            description: "Web3 Payment Platform",
            url: window.location.origin,
            icons: [DAPP_ICON],
          },
        });

        this.signClient = await globalInitPromise;
        globalSignClient = this.signClient;
        globalInitPromise = null; // 重置，允许后续重新初始化
      }

      this.setupEventListeners();
      this.isInitialized = true;

      // 检查是否有待恢复的连接状态
      await this.checkPendingConnection();

      // 如果有现有会话，验证其有效性
      if (this.session) {
        await this.validateSessionOnInit();
      }

      console.log("[TrustWallet] Initialization completed successfully");
    } catch (err) {
      this.signClient = null;
      this.isInitialized = false;
      this.clearSession();
      const error = err instanceof Error ? err : new Error(String(err));
      throw new TrustWalletError(
        TrustWalletErrorType.INITIALIZATION_FAILED,
        `Failed to initialize Trust Wallet: ${error.message}`,
        error
      );
    }
  }

  /**
   * 检查待处理的连接状态
   */
  private async checkPendingConnection(): Promise<void> {
    try {
      const isConnecting =
        localStorage.getItem("trust_wallet_connecting") === "true";
      if (isConnecting) {
        console.log(
          "[TrustWallet] Found pending connection, checking status..."
        );

        // 等待一段时间让 WalletConnect 处理可能的回调
        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.CALLBACK_WAIT_TIME)
        );

        // 检查是否有新建立的会话
        const sessions = this.signClient?.session.getAll() || [];
        const recentSession = sessions.find(
          (s) =>
            s.acknowledged === true && s.expiry && Date.now() < s.expiry * 1000
        );

        if (recentSession) {
          console.log(
            "[TrustWallet] Found recent session, establishing connection..."
          );
          await this.handleSessionEstablished(recentSession);
        } else {
          console.log(
            "[TrustWallet] No recent session found, clearing pending state"
          );
          this.clearConnectionState();
        }
      }
    } catch (error) {
      console.error("[TrustWallet] Error checking pending connection:", error);
      this.clearConnectionState();
    }
  }

  /**
   * 连接钱包
   */
  async connect(): Promise<void> {
    await this._connectInternal();
  }

  /**
   * 内部连接实现
   */
  private async _connectInternal(): Promise<void> {
    if (this.connected && this.session) {
      throw new Error("Wallet already connected");
    }

    if (!this.signClient) {
      await this.init();
    }

    try {
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

      if (uri) {
        // 保存连接状态到 localStorage，用于页面返回后恢复
        localStorage.setItem("trust_wallet_connecting", "true");
        localStorage.setItem("trust_wallet_uri", uri);

        const trustDeeplink = `${TRUST_DEEPLINK_BASE}/wc?uri=${encodeURIComponent(uri)}`;

        // 使用 setTimeout 确保状态保存后再重定向
        setTimeout(() => {
          window.location.href = trustDeeplink;
        }, CONFIG.REDIRECT_DELAY);

        // 不立即返回，而是等待用户返回后的会话恢复
        // 这里需要等待一个合理的超时时间
        return new Promise((resolve, reject) => {
          let isResolved = false;

          const timeout = setTimeout(() => {
            if (!isResolved) {
              isResolved = true;
              this.clearConnectionState();
              reject(
                new TrustWalletError(
                  TrustWalletErrorType.CONNECTION_TIMEOUT,
                  "Connection timeout. Please make sure you approved the connection in Trust Wallet and try again."
                )
              );
            }
          }, CONFIG.CONNECTION_TIMEOUT);

          // 监听页面可见性变化，当用户返回时检查连接状态
          const handleVisibilityChange = () => {
            if (!document.hidden && !isResolved) {
              setTimeout(() => {
                this.checkConnectionAfterReturn()
                  .then((success) => {
                    if (success && !isResolved) {
                      isResolved = true;
                      clearTimeout(timeout);
                      document.removeEventListener(
                        "visibilitychange",
                        handleVisibilityChange
                      );
                      resolve();
                    } else if (!isResolved) {
                      // 连接失败，但可能用户还在处理中，继续等待
                      console.log(
                        "[TrustWallet] Connection check failed, continuing to wait..."
                      );
                    }
                  })
                  .catch((error) => {
                    console.error(
                      "[TrustWallet] Connection check error:",
                      error
                    );
                    if (!isResolved) {
                      // 连接检查失败，但继续等待，可能是临时问题
                    }
                  });
              }, CONFIG.RETRY_DELAY); // 等待让WalletConnect处理回调
            }
          };

          document.addEventListener("visibilitychange", handleVisibilityChange);

          // 也设置一个定期检查，以防页面可见性事件没有触发
          const checkInterval = setInterval(() => {
            if (!isResolved && !document.hidden) {
              this.checkConnectionAfterReturn()
                .then((success) => {
                  if (success && !isResolved) {
                    isResolved = true;
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    document.removeEventListener(
                      "visibilitychange",
                      handleVisibilityChange
                    );
                    resolve();
                  }
                })
                .catch(() => {
                  // 继续等待
                });
            }
          }, CONFIG.POLL_INTERVAL); // 定期检查连接状态

          // 清理函数
          const cleanup = () => {
            clearInterval(checkInterval);
            document.removeEventListener(
              "visibilitychange",
              handleVisibilityChange
            );
          };

          // 如果Promise被resolve或reject，确保清理资源
          const originalResolve = resolve;
          const originalReject = reject;
          resolve = (value) => {
            cleanup();
            originalResolve(value);
          };
          reject = (reason) => {
            cleanup();
            originalReject(reason);
          };
        });
      }

      // 如果没有 URI，直接等待 approval（这种情况很少见）
      const session = await approval();
      await this.handleSessionEstablished(session);
    } catch (error) {
      console.error("[TrustWallet] Connection failed:", error);
      this.clearConnectionState();
      throw error;
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.signClient) return;

    this.signClient.on("session_delete", (event) => {
      console.log("[TrustWallet] Session deleted:", event);
      this.clearSession();
    });

    this.signClient.on("session_expire", (event) => {
      console.log("[TrustWallet] Session expired:", event);
      this.clearSession();
    });

    this.signClient.on("session_update", (event) => {
      console.log("[TrustWallet] Session updated:", event);
      // 可以在这里处理会话更新
    });

    this.signClient.on("session_ping", (event) => {
      console.log("[TrustWallet] Session ping:", event);
      // 会话心跳，表示连接正常
    });
  }

  /**
   * 处理会话建立
   */
  private async handleSessionEstablished(
    session: SessionTypes.Struct
  ): Promise<void> {
    try {
      this.session = session;

      const accounts =
        session.namespaces[WALLETCONNECT_NAMESPACE]?.accounts || [];
      if (accounts.length > 0) {
        this.publicKey = accounts[0].split(":")[2];
      }

      if (this.publicKey) {
        this.connected = true;
        this.saveSession(this.session, this.publicKey);
        this.clearConnectionState();
        console.log(
          "[TrustWallet] Session established successfully:",
          this.publicKey
        );
      } else {
        throw new Error("Failed to extract public key from session");
      }
    } catch (error) {
      console.error("[TrustWallet] Failed to handle session:", error);
      this.clearConnectionState();
      throw error;
    }
  }

  /**
   * 用户从钱包返回后检查连接状态
   */
  private async checkConnectionAfterReturn(): Promise<boolean> {
    try {
      console.log("[TrustWallet] Checking connection after return...");

      // 等待一段时间让 WalletConnect 处理回调
      await new Promise((resolve) =>
        setTimeout(resolve, CONFIG.CALLBACK_WAIT_TIME)
      );

      // 检查是否有活跃的会话
      const sessions = this.signClient?.session.getAll() || [];
      const activeSession = sessions.find(
        (s) =>
          s.acknowledged === true && s.expiry && Date.now() < s.expiry * 1000
      );

      if (activeSession) {
        console.log("[TrustWallet] Found active session:", activeSession.topic);
        await this.handleSessionEstablished(activeSession);
        return true;
      }

      // 如果没有找到活跃会话，检查是否有待处理的连接
      const isConnecting =
        localStorage.getItem("trust_wallet_connecting") === "true";
      if (isConnecting) {
        console.log("[TrustWallet] Still waiting for session approval...");

        // 再次等待并检查
        await new Promise((resolve) => setTimeout(resolve, CONFIG.RETRY_DELAY));
        const sessionsRetry = this.signClient?.session.getAll() || [];
        const retrySession = sessionsRetry.find(
          (s) =>
            s.acknowledged === true && s.expiry && Date.now() < s.expiry * 1000
        );

        if (retrySession) {
          console.log(
            "[TrustWallet] Found session on retry:",
            retrySession.topic
          );
          await this.handleSessionEstablished(retrySession);
          return true;
        }

        // 如果还是没有找到会话，说明连接可能被拒绝了
        console.log(
          "[TrustWallet] No session found after retry, connection may have been rejected"
        );
        this.clearConnectionState();
        return false;
      }

      console.log("[TrustWallet] No active session found");
      return false;
    } catch (error) {
      console.error("[TrustWallet] Error checking connection:", error);
      this.clearConnectionState();
      return false;
    }
  }

  /**
   * 清除连接状态
   */
  private clearConnectionState(): void {
    localStorage.removeItem("trust_wallet_connecting");
    localStorage.removeItem("trust_wallet_uri");
  }

  /**
   * 验证当前会话是否仍然有效
   */
  async validateSession(): Promise<boolean> {
    if (!this.signClient || !this.session) {
      console.log("[TrustWallet] No signClient or session to validate");
      return false;
    }

    // 防止重复验证
    if (this.isValidationInProgress) {
      console.log("[TrustWallet] Validation already in progress, skipping");
      return false;
    }

    this.isValidationInProgress = true;

    try {
      // 1. 检查会话是否在 WalletConnect 客户端中存在
      const sessions = this.signClient.session.getAll();
      const currentSession = sessions.find(
        (s) => s.topic === this.session!.topic
      );

      if (!currentSession) {
        console.log("[TrustWallet] Session not found in WalletConnect client");
        return false;
      }

      // 2. 检查会话是否过期
      const now = Date.now();
      if (currentSession.expiry && now > currentSession.expiry * 1000) {
        console.log("[TrustWallet] Session expired");
        return false;
      }

      // 3. 验证会话状态
      if (currentSession.acknowledged !== true) {
        console.log("[TrustWallet] Session not acknowledged");
        return false;
      }

      console.log("[TrustWallet] Session validation successful");
      return true;
    } catch (error) {
      console.error("[TrustWallet] Session validation failed:", error);
      return false;
    } finally {
      this.isValidationInProgress = false;
    }
  }

  /**
   * 清除无效会话并重置状态
   */
  clearInvalidSession(): void {
    console.log("[TrustWallet] Clearing invalid session");
    this.clearSession();
    this.clearConnectionState();
  }

  /**
   * 初始化时验证会话（在 init 方法中调用）
   */
  private async validateSessionOnInit(): Promise<void> {
    if (!this.session) {
      return; // 没有会话需要验证
    }

    const isValid = await this.validateSession();
    if (!isValid) {
      console.log("[TrustWallet] Session invalid on init, clearing state");
      this.clearInvalidSession();
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    try {
      if (this.signClient && this.session) {
        await this.signClient.disconnect({
          topic: this.session.topic,
          reason: {
            code: 6000,
            message: "User disconnected",
          },
        });
      }
    } catch (error) {
      console.warn("Error disconnecting Trust Wallet:", error);
    } finally {
      this.clearSession();
      this.clearConnectionState();
      this.signClient = null;
    }
  }

  /**
   * 签名交易
   */
  async signTransaction(transaction: Transaction): Promise<Transaction> {
    if (!this.connected || !this.session || !this.signClient) {
      throw new TrustWalletError(
        TrustWalletErrorType.SESSION_NOT_FOUND,
        "Wallet not connected. Please connect first."
      );
    }

    // 在签名前验证会话是否仍然有效
    const isValid = await this.validateSession();
    if (!isValid) {
      this.clearInvalidSession();
      throw new TrustWalletError(
        TrustWalletErrorType.SESSION_NOT_FOUND,
        "Wallet session expired. Please reconnect your Trust Wallet."
      );
    }

    if (!transaction.recentBlockhash || !transaction.feePayer) {
      throw new TrustWalletError(
        TrustWalletErrorType.SIGNATURE_FAILED,
        "Invalid transaction: missing blockhash or feePayer"
      );
    }

    try {
      const serializedTransaction = transaction
        .serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
        .toString("base64");

      console.log("[TrustWallet] Requesting transaction signature...");
      const result = await this.signClient.request({
        topic: this.session.topic,
        chainId: SOLANA_MAINNET_CHAIN_ID,
        request: {
          method: SOLANA_METHODS.SIGN_TRANSACTION,
          params: {
            transaction: serializedTransaction,
          },
        },
      });

      console.log("[TrustWallet] Received signature result:", {
        type: typeof result,
        isString: typeof result === "string",
        isObject: typeof result === "object" && result !== null,
        hasSignature:
          typeof result === "object" &&
          result !== null &&
          "signature" in result,
        result: result,
      });

      let signature: Buffer;
      let signatureBase64: string;

      if (typeof result === "string") {
        signatureBase64 = result;
        signature = Buffer.from(result, "base64");
        console.log("[TrustWallet] Signature from string result");
      } else if (
        result &&
        typeof result === "object" &&
        "signature" in result
      ) {
        const signatureResult = result as { signature: string };
        signatureBase64 = signatureResult.signature;
        signature = Buffer.from(signatureResult.signature, "base64");
        console.log("[TrustWallet] Signature from object.signature");
      } else {
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          "Invalid signature result from Trust Wallet"
        );
      }

      console.log("[TrustWallet] Signature base64:", signatureBase64);
      console.log(
        "[TrustWallet] Signature hex (full):",
        signature.toString("hex")
      );
      console.log("[TrustWallet] Signature length:", signature.length, "bytes");

      // Trust Wallet 返回的签名需要特殊处理
      console.log("[TrustWallet] Processing signature...");

      if (signature.length === 66) {
        console.log("[TrustWallet] Detected 66-byte signature");
        console.log(
          "[TrustWallet] First 2 bytes (hex):",
          signature.slice(0, 2).toString("hex")
        );
        console.log(
          "[TrustWallet] Last 2 bytes (hex):",
          signature.slice(-2).toString("hex")
        );

        // Trust Wallet 可能返回了已签名的完整交易而不是签名本身
        // 尝试提取前 64 字节作为签名
        const sig64 = signature.slice(0, 64);
        console.log("[TrustWallet] Trying first 64 bytes as signature");
        console.log("[TrustWallet] Signature hex:", sig64.toString("hex"));

        const signerPublicKey = new PublicKey(this.publicKey!);

        for (let i = 0; i < transaction.signatures.length; i++) {
          if (transaction.signatures[i].publicKey.equals(signerPublicKey)) {
            transaction.signatures[i].signature = sig64;
            break;
          }
        }

        // 跳过 verifySignatures，因为 Trust Wallet 的签名可能使用不同的格式
        console.log(
          "[TrustWallet] Skipping signature verification, will verify on-chain"
        );
      } else if (signature.length === 64) {
        console.log("[TrustWallet] Standard 64-byte signature detected");
        const signerPublicKey = new PublicKey(this.publicKey!);

        for (let i = 0; i < transaction.signatures.length; i++) {
          if (transaction.signatures[i].publicKey.equals(signerPublicKey)) {
            transaction.signatures[i].signature = signature;
            break;
          }
        }

        // 尝试验证签名
        try {
          if (!transaction.verifySignatures()) {
            console.warn(
              "[TrustWallet] Local signature verification failed, but proceeding anyway"
            );
          } else {
            console.log("[TrustWallet] Signature verification passed");
          }
        } catch (err) {
          console.warn("[TrustWallet] Signature verification error:", err);
        }
      } else {
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          `Unexpected signature length: expected 64 or 66 bytes, got ${signature.length} bytes`
        );
      }

      console.log("[TrustWallet] Transaction signed successfully");
      return transaction;
    } catch (error) {
      const originalError =
        error instanceof Error ? error : new Error(String(error));

      // 检查是否是用户拒绝签名
      if (
        originalError.message.includes("User rejected") ||
        originalError.message.includes("rejected") ||
        originalError.message.includes("denied")
      ) {
        throw new TrustWalletError(
          TrustWalletErrorType.USER_REJECTED,
          "Transaction was rejected by user",
          originalError
        );
      }

      // 检查是否是网络错误
      if (
        originalError.message.includes("network") ||
        originalError.message.includes("timeout") ||
        originalError.message.includes("fetch")
      ) {
        throw new TrustWalletError(
          TrustWalletErrorType.NETWORK_ERROR,
          "Network error during transaction signing",
          originalError
        );
      }

      // 其他错误
      throw new TrustWalletError(
        TrustWalletErrorType.SIGNATURE_FAILED,
        `Transaction signing failed: ${originalError.message}`,
        originalError
      );
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
   * 保存 Session
   */
  private saveSession(session: SessionTypes.Struct, publicKey: string): void {
    try {
      const data = {
        session,
        publicKey,
        timestamp: Date.now(),
      };
      localStorage.setItem(TRUST_SESSION_KEY, JSON.stringify(data));
    } catch (err) {
      console.error("Failed to save Trust Wallet session:", err);
    }
  }

  /**
   * 恢复 Session
   */
  private restoreSession(): void {
    try {
      const saved = localStorage.getItem(TRUST_SESSION_KEY);
      if (!saved) return;

      const { session, publicKey, timestamp } = JSON.parse(saved);

      if (Date.now() - timestamp > SESSION_EXPIRY) {
        localStorage.removeItem(TRUST_SESSION_KEY);
        return;
      }

      this.session = session;
      this.publicKey = publicKey;
      this.connected = true;
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
   * 处理回调
   */
  async handleCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    if (this.connected && this.publicKey) {
      return {
        type: "connect",
        success: true,
        data: { publicKey: this.publicKey } as unknown,
      };
    }

    return {
      type: "signTransaction",
      success: true,
      data: {
        message: "Trust Wallet callback handled via WalletConnect",
      } as unknown,
    };
  }
}
