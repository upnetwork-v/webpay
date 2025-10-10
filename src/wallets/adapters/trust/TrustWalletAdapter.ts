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
import WalletConnect from "@walletconnect/client";
import QRCodeModal from "@walletconnect/qrcode-modal";

// 内联常量定义
const SOLANA_NETWORK = 501; // Solana SLIP-44
const TRUST_METHODS = {
  SIGN_TRANSACTION: "trust_signTransaction",
  GET_ACCOUNTS: "get_accounts",
} as const;
const TRUST_SESSION_KEY = "trust_wallet_session";
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const WALLETCONNECT_BRIDGE = "https://bridge.walletconnect.org";

// 配置常量
const CONFIG = {
  CONNECTION_TIMEOUT: 120000, // 2分钟连接超时
  RETRY_DELAY: 2000, // 重试延迟
  POLL_INTERVAL: 5000, // 轮询间隔
  REDIRECT_DELAY: 100, // 重定向延迟
  CALLBACK_WAIT_TIME: 1000, // 回调等待时间
} as const;

// 全局 WalletConnect 实例管理，防止重复初始化
let globalConnector: WalletConnect | null = null;
let globalInitPromise: Promise<WalletConnect> | null = null;

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
 * Trust Wallet 适配器 - WalletConnect V1 实现
 */
export class TrustWalletAdapter implements TrustWalletAdapterExtended {
  private connector: WalletConnect | null = null;
  private accounts: Array<{ network: number; address: string }> = [];
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
    if (this.isInitialized && this.connector) {
      return;
    }

    try {
      // 使用全局实例，避免重复初始化 WalletConnect
      if (globalConnector) {
        console.log("[TrustWallet] Using existing WalletConnect connector");
        this.connector = globalConnector;
      } else if (globalInitPromise) {
        console.log(
          "[TrustWallet] Waiting for existing WalletConnect initialization..."
        );
        this.connector = await globalInitPromise;
      } else {
        console.log(
          "[TrustWallet] Initializing new WalletConnect connector..."
        );
        globalInitPromise = new Promise((resolve, reject) => {
          try {
            const connector = new WalletConnect({
              bridge: WALLETCONNECT_BRIDGE,
              qrcodeModal: QRCodeModal,
            });
            resolve(connector);
          } catch (error) {
            reject(error);
          }
        });

        this.connector = await globalInitPromise;
        globalConnector = this.connector;
        globalInitPromise = null; // 重置，允许后续重新初始化
      }

      this.setupEventListeners();
      this.isInitialized = true;

      // 检查是否有现有连接
      if (this.connector.connected) {
        await this.restoreConnection();
      }

      console.log("[TrustWallet] Initialization completed successfully");
    } catch (err) {
      this.connector = null;
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
   * 恢复现有连接
   */
  private async restoreConnection(): Promise<void> {
    try {
      console.log("[TrustWallet] Restoring existing connection...");

      // 获取账户列表
      await this.getAccounts();

      // 找到 Solana 账户
      const solanaAccount = this.accounts.find(
        (account) => account.network === SOLANA_NETWORK
      );

      if (solanaAccount) {
        this.publicKey = solanaAccount.address;
        this.connected = true;
        this.saveSession();
        console.log(
          "[TrustWallet] Connection restored successfully:",
          this.publicKey
        );
      } else {
        console.log(
          "[TrustWallet] No Solana account found in restored connection"
        );
      }
    } catch (error) {
      console.error("[TrustWallet] Error restoring connection:", error);
      this.clearSession();
    }
  }

  /**
   * 连接钱包
   */
  async connect(): Promise<void> {
    if (this.connected) {
      throw new Error("Wallet already connected");
    }

    if (!this.connector) {
      await this.init();
    }

    try {
      // 如果还没有连接，创建新会话
      if (!this.connector!.connected) {
        console.log("[TrustWallet] Creating new WalletConnect session...");
        this.connector!.createSession();
      }

      // 等待连接事件
      return new Promise((resolve, reject) => {
        let isResolved = false;

        const timeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            reject(
              new TrustWalletError(
                TrustWalletErrorType.CONNECTION_TIMEOUT,
                "Connection timeout. Please make sure you approved the connection in Trust Wallet and try again."
              )
            );
          }
        }, CONFIG.CONNECTION_TIMEOUT);

        // 监听连接成功事件
        const handleConnect = async () => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);

            try {
              // 获取账户列表
              await this.getAccounts();

              // 找到 Solana 账户
              const solanaAccount = this.accounts.find(
                (account) => account.network === SOLANA_NETWORK
              );

              if (solanaAccount) {
                this.publicKey = solanaAccount.address;
                this.connected = true;
                this.saveSession();
                console.log(
                  "[TrustWallet] Connection successful:",
                  this.publicKey
                );
                resolve();
              } else {
                reject(new Error("No Solana account found"));
              }
            } catch (error) {
              reject(error);
            }
          }
        };

        // 监听连接失败事件
        const handleConnectError = (error: Error | null) => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            reject(error || new Error("Connection failed"));
          }
        };

        // 绑定事件监听器
        this.connector!.on("connect", handleConnect);
        this.connector!.on("disconnect", handleConnectError);
      });
    } catch (error) {
      console.error("[TrustWallet] Connection failed:", error);
      throw error;
    }
  }

  /**
   * 获取账户列表
   */
  private async getAccounts(): Promise<void> {
    if (!this.connector) {
      throw new Error("WalletConnect not initialized");
    }

    try {
      // 使用公开的方法
      const result = await this.connector.sendCustomRequest({
        method: TRUST_METHODS.GET_ACCOUNTS,
        params: [],
      });

      console.log("[TrustWallet] Accounts received:", result);

      if (Array.isArray(result)) {
        this.accounts = result;
      } else {
        throw new Error("Invalid accounts response format");
      }
    } catch (error) {
      console.error("[TrustWallet] Error getting accounts:", error);
      throw error;
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.connector) return;

    this.connector.on("disconnect", (_error, payload) => {
      console.log("[TrustWallet] Disconnected:", payload);
      this.clearSession();
    });

    this.connector.on("session_update", (_error, payload) => {
      console.log("[TrustWallet] Session updated:", payload);
      // 可以在这里处理会话更新
    });
  }

  /**
   * 签名交易
   */
  async signTransaction(transaction: Transaction): Promise<Transaction> {
    if (!this.connected || !this.connector) {
      throw new TrustWalletError(
        TrustWalletErrorType.SESSION_NOT_FOUND,
        "Wallet not connected. Please connect first."
      );
    }

    // 在签名前验证连接是否仍然有效
    if (!this.connector.connected) {
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
      // 序列化交易为 base64
      const serializedTransaction = transaction
        .serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
        .toString("base64");

      console.log("[TrustWallet] Requesting transaction signature...");

      // 使用 Trust Wallet 的 trust_signTransaction 方法
      const result = await this.connector.sendCustomRequest({
        method: TRUST_METHODS.SIGN_TRANSACTION,
        params: [
          {
            network: SOLANA_NETWORK,
            transaction: serializedTransaction,
          },
        ],
      });

      console.log("[TrustWallet] Received signature result:", {
        type: typeof result,
        isString: typeof result === "string",
        isObject: typeof result === "object" && result !== null,
        result: result,
      });

      // 根据 Trust Wallet 文档，返回的是完整的已签名交易
      let signedTransactionData: string;

      if (typeof result === "string") {
        // 如果是字符串，可能是 HEX 编码的已签名交易
        signedTransactionData = result;
        console.log("[TrustWallet] Received HEX encoded signed transaction");
      } else if (result && typeof result === "object") {
        // 如果是对象，可能是 JSON 格式的已签名交易
        signedTransactionData = JSON.stringify(result);
        console.log("[TrustWallet] Received JSON signed transaction");
      } else {
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          "Invalid signature result from Trust Wallet"
        );
      }

      console.log("[TrustWallet] Processing signed transaction data...");
      console.log(
        "[TrustWallet] Signed transaction data:",
        signedTransactionData
      );

      // 尝试解析已签名交易
      let signedTransaction: Transaction;

      try {
        // 首先尝试作为 HEX 字符串解析
        if (typeof result === "string" && /^[0-9a-fA-F]+$/.test(result)) {
          // HEX 字符串，转换为 Buffer 然后解析为 Transaction
          const txBuffer = Buffer.from(result, "hex");
          signedTransaction = Transaction.from(txBuffer);
          console.log(
            "[TrustWallet] Successfully parsed HEX encoded transaction"
          );
        } else {
          // 如果不是 HEX，尝试作为 base64 解析
          const txBuffer = Buffer.from(signedTransactionData, "base64");
          signedTransaction = Transaction.from(txBuffer);
          console.log(
            "[TrustWallet] Successfully parsed base64 encoded transaction"
          );
        }
      } catch (parseError) {
        console.error(
          "[TrustWallet] Failed to parse signed transaction:",
          parseError
        );
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          `Failed to parse signed transaction from Trust Wallet: ${parseError}`
        );
      }

      // 验证已签名交易
      if (
        !signedTransaction.signatures ||
        signedTransaction.signatures.length === 0
      ) {
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          "Signed transaction has no signatures"
        );
      }

      // 找到对应的签名
      const signerPublicKey = new PublicKey(this.publicKey!);
      const signatureIndex = signedTransaction.signatures.findIndex((sig) =>
        sig.publicKey.equals(signerPublicKey)
      );

      if (signatureIndex === -1) {
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          `No signature found for public key: ${signerPublicKey.toString()}`
        );
      }

      const signature = signedTransaction.signatures[signatureIndex].signature;
      if (!signature || signature.length === 0) {
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          "Signature is empty"
        );
      }

      console.log(
        "[TrustWallet] Found signature for public key:",
        signerPublicKey.toString()
      );
      console.log("[TrustWallet] Signature length:", signature.length, "bytes");
      console.log("[TrustWallet] Signature hex:", signature.toString("hex"));

      // 将签名应用到原始交易
      const sig64 = signature;

      // 验证签名长度
      if (sig64.length !== 64) {
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          `Invalid signature length: expected 64 bytes, got ${sig64.length} bytes`
        );
      }

      // 设置签名到原始交易中
      const originalSignerPublicKey = new PublicKey(this.publicKey!);
      let signatureSet = false;

      for (let i = 0; i < transaction.signatures.length; i++) {
        if (
          transaction.signatures[i].publicKey.equals(originalSignerPublicKey)
        ) {
          transaction.signatures[i].signature = sig64;
          signatureSet = true;
          console.log(
            `[TrustWallet] Signature set for public key: ${originalSignerPublicKey.toString()}`
          );
          break;
        }
      }

      if (!signatureSet) {
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          `Could not find signature slot for the connected wallet (${originalSignerPublicKey.toString()}). ` +
            `Transaction may have been modified or the public key does not match.`
        );
      }

      // 尝试验证签名
      try {
        if (!transaction.verifySignatures()) {
          console.warn(
            "[TrustWallet] Local signature verification failed, but proceeding with on-chain verification"
          );
        } else {
          console.log("[TrustWallet] Local signature verification passed");
        }
      } catch (err) {
        console.warn("[TrustWallet] Local signature verification error:", err);
        console.log("[TrustWallet] Proceeding with on-chain verification");
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
   * 验证当前会话是否仍然有效
   */
  async validateSession(): Promise<boolean> {
    if (!this.connector || !this.connected) {
      console.log("[TrustWallet] No connector or not connected to validate");
      return false;
    }

    // 防止重复验证
    if (this.isValidationInProgress) {
      console.log("[TrustWallet] Validation already in progress, skipping");
      return false;
    }

    this.isValidationInProgress = true;

    try {
      // 检查连接是否仍然有效
      if (!this.connector.connected) {
        console.log("[TrustWallet] Connector not connected");
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
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    try {
      if (this.connector) {
        await this.connector.killSession();
      }
    } catch (error) {
      console.warn("Error disconnecting Trust Wallet:", error);
    } finally {
      this.clearSession();
      this.connector = null;
    }
  }

  /**
   * 保存 Session
   */
  private saveSession(): void {
    try {
      const data = {
        accounts: this.accounts,
        publicKey: this.publicKey,
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

      const { accounts, publicKey, timestamp } = JSON.parse(saved);

      if (Date.now() - timestamp > SESSION_EXPIRY) {
        localStorage.removeItem(TRUST_SESSION_KEY);
        return;
      }

      this.accounts = accounts || [];
      this.publicKey = publicKey;
      this.connected = !!publicKey;
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
    this.accounts = [];
    this.publicKey = null;
    this.connected = false;
  }

  /**
   * 处理回调
   */
  async handleCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    console.log("[TrustWallet] Handling callback with params:", params);

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
        message: "Trust Wallet callback handled via WalletConnect v1",
        params: params,
      } as unknown,
    };
  }
}
