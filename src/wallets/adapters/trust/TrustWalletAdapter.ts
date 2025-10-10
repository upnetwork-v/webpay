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
import { SignClient } from "@walletconnect/sign-client";
import type { SessionTypes } from "@walletconnect/types";
import { sendRawTransaction } from "@/utils/transaction";

// 内联常量定义
const SOLANA_MAINNET_CHAIN_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // Solana 主网链 ID
const SOLANA_SLIP44 = 501; // Solana SLIP-44 for address derivation
const TRUST_METHODS = {
  SIGN_TRANSACTION: "solana_signTransaction", // 使用标准 Solana 方法
  GET_ACCOUNTS: "solana_getAccounts", // 使用标准 Solana 方法
} as const;
const TRUST_SESSION_KEY = "trust_wallet_session";
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// 全局 SignClient 实例管理
let globalSignClient: InstanceType<typeof SignClient> | null = null;
let globalInitPromise: Promise<InstanceType<typeof SignClient>> | null = null;

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
 * Trust Wallet 适配器 - WalletConnect v2 实现
 */
export class TrustWalletAdapter implements TrustWalletAdapterExtended {
  private signClient: InstanceType<typeof SignClient> | null = null;
  private session: SessionTypes.Struct | null = null;
  private accounts: Array<{ network: number; address: string }> = [];
  private publicKey: string | null = null;
  private connected: boolean = false;
  private isInitialized: boolean = false;
  private isValidationInProgress: boolean = false;

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

    try {
      // 使用全局实例，避免重复初始化 SignClient
      if (globalSignClient) {
        console.log("[TrustWallet] Using existing SignClient instance");
        this.signClient = globalSignClient;
      } else if (globalInitPromise) {
        console.log(
          "[TrustWallet] Waiting for existing SignClient initialization..."
        );
        this.signClient = await globalInitPromise;
      } else {
        console.log("[TrustWallet] Initializing new SignClient...");
        globalInitPromise = this.initializeSignClient();
        this.signClient = await globalInitPromise;
        globalSignClient = this.signClient;
        globalInitPromise = null;
      }

      this.isInitialized = true;

      // 检查是否有现有会话
      if (this.session) {
        await this.restoreConnection();
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
   * 初始化 SignClient
   */
  private async initializeSignClient(): Promise<
    InstanceType<typeof SignClient>
  > {
    const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
    if (!projectId) {
      throw new TrustWalletError(
        TrustWalletErrorType.INITIALIZATION_FAILED,
        "VITE_WALLETCONNECT_PROJECT_ID environment variable is not set"
      );
    }

    const signClient = await SignClient.init({
      projectId,
      metadata: {
        name: "OntaPay",
        description: "Web Payment Application",
        url: window.location.origin,
        icons: [`${window.location.origin}/logo.svg`],
      },
    });

    // 设置事件监听器
    signClient.on("session_event", (event) => {
      console.log("[TrustWallet] Session event:", event);
    });

    signClient.on("session_update", (event) => {
      console.log("[TrustWallet] Session update:", event);
    });

    signClient.on("session_delete", (event) => {
      console.log("[TrustWallet] Session deleted:", event);
      this.handleDisconnect();
    });

    return signClient;
  }

  /**
   * 连接 Trust Wallet
   */
  async connect(): Promise<void> {
    if (!this.isInitialized || !this.signClient) {
      throw new TrustWalletError(
        TrustWalletErrorType.INITIALIZATION_FAILED,
        "Wallet not initialized. Please call init() first."
      );
    }

    if (this.connected && this.publicKey) {
      console.log("[TrustWallet] Already connected");
      return;
    }

    try {
      console.log("[TrustWallet] Starting connection...");

      // 创建连接请求 - 使用正确的 Solana 主网链 ID
      const { uri, approval } = await this.signClient.connect({
        requiredNamespaces: {
          solana: {
            methods: [
              TRUST_METHODS.SIGN_TRANSACTION,
              TRUST_METHODS.GET_ACCOUNTS,
            ],
            chains: [SOLANA_MAINNET_CHAIN_ID], // Solana 主网链 ID
            events: [],
          },
        },
      });

      console.log("[TrustWallet] Connection URI generated:", uri);

      // 显示二维码或深链接
      if (uri) {
        // 尝试使用深链接打开 Trust Wallet
        const trustWalletUrl = `trust://wc?uri=${encodeURIComponent(uri)}`;
        console.log("[TrustWallet] Trust Wallet URL:", trustWalletUrl);

        // 尝试打开 Trust Wallet 应用
        window.open(trustWalletUrl, "_blank");

        // 也可以显示二维码供用户扫描
        console.log("[TrustWallet] QR Code URI:", uri);
      }

      // 等待用户批准连接
      console.log("[TrustWallet] Waiting for user approval...");
      this.session = await approval();

      console.log("[TrustWallet] Connection approved:", this.session);

      // 处理连接成功
      await this.handleConnectionSuccess();
    } catch (error) {
      const originalError =
        error instanceof Error ? error : new Error(String(error));

      // 检查是否是用户拒绝
      if (
        originalError.message.includes("User rejected") ||
        originalError.message.includes("rejected by user") ||
        originalError.message.includes("Connection request reset")
      ) {
        throw new TrustWalletError(
          TrustWalletErrorType.USER_REJECTED,
          "Connection was cancelled by user",
          originalError
        );
      }

      throw new TrustWalletError(
        TrustWalletErrorType.CONNECTION_TIMEOUT,
        `Failed to connect: ${originalError.message}`,
        originalError
      );
    }
  }

  /**
   * 处理连接成功
   */
  private async handleConnectionSuccess(): Promise<void> {
    if (!this.session) {
      throw new Error("Session not available");
    }

    try {
      // 获取账户信息
      await this.getAccounts();

      // 保存会话
      this.saveSession();

      this.connected = true;

      console.log("[TrustWallet] Connected successfully");
      console.log("[TrustWallet] Public key:", this.publicKey);
      console.log("[TrustWallet] Accounts:", this.accounts);
    } catch (error) {
      console.error("[TrustWallet] Error handling connection success:", error);
      this.handleDisconnect();
      throw error;
    }
  }

  /**
   * 获取账户信息
   */
  private async getAccounts(): Promise<void> {
    if (!this.signClient || !this.session) {
      throw new Error("SignClient or session not available");
    }

    try {
      // 使用标准的 Solana 账户获取方法
      const result = await this.signClient.request({
        topic: this.session.topic,
        chainId: SOLANA_MAINNET_CHAIN_ID, // 使用正确的 Solana 主网链 ID
        request: {
          method: TRUST_METHODS.GET_ACCOUNTS,
          params: [],
        },
      });

      console.log("[TrustWallet] Accounts received:", result);

      if (Array.isArray(result)) {
        // 只保留 Solana 账户 (network: 501)
        this.accounts = result.filter(
          (account) => account.network === SOLANA_SLIP44
        );

        // 找到第一个 Solana 账户
        const solanaAccount = this.accounts[0];

        if (solanaAccount) {
          this.publicKey = solanaAccount.address;
          console.log("[TrustWallet] Found Solana account:", this.publicKey);
        } else {
          console.log("[TrustWallet] No Solana account found");
        }
      } else {
        throw new Error("Invalid accounts response format");
      }
    } catch (error) {
      console.error("[TrustWallet] Error getting accounts:", error);
      // 不抛出错误，因为可能不是所有提供商都支持这个方法
    }
  }

  /**
   * 签名交易
   */
  async signTransaction(transaction: Transaction): Promise<Transaction> {
    if (!this.connected || !this.signClient || !this.session) {
      throw new TrustWalletError(
        TrustWalletErrorType.SESSION_NOT_FOUND,
        "Wallet not connected. Please connect first."
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

      // 使用标准的 Solana 签名方法
      const result = await this.signClient.request({
        topic: this.session.topic,
        chainId: SOLANA_MAINNET_CHAIN_ID, // 使用正确的 Solana 主网链 ID
        request: {
          method: TRUST_METHODS.SIGN_TRANSACTION,
          params: [serializedTransaction], // 标准 Solana 格式
        },
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
        originalError.message.includes("rejected by user")
      ) {
        throw new TrustWalletError(
          TrustWalletErrorType.USER_REJECTED,
          "Payment was cancelled by user",
          originalError
        );
      }

      throw new TrustWalletError(
        TrustWalletErrorType.SIGNATURE_FAILED,
        `Failed to sign transaction: ${originalError.message}`,
        originalError
      );
    }
  }

  /**
   * 广播已签名交易
   */
  async sendRawTransaction(signedTransaction: Transaction): Promise<string> {
    // 使用静态导入的函数
    return sendRawTransaction(signedTransaction);
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected && !!this.publicKey;
  }

  /**
   * 获取公钥
   */
  getPublicKey(): string | null {
    return this.publicKey;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    console.log("[TrustWallet] Disconnecting...");

    if (this.signClient && this.session) {
      try {
        await this.signClient.disconnect({
          topic: this.session.topic,
          reason: {
            code: 6000,
            message: "User disconnected",
          },
        });
      } catch (error) {
        console.warn("[TrustWallet] Error during disconnect:", error);
      }
    }

    this.handleDisconnect();
  }

  /**
   * 处理断开连接
   */
  private handleDisconnect(): void {
    this.connected = false;
    this.publicKey = null;
    this.accounts = [];
    this.session = null;
    this.clearSession();
    console.log("[TrustWallet] Disconnected");
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
        message: "Trust Wallet callback handled via WalletConnect v2",
        params: params,
      } as unknown,
    };
  }

  /**
   * 验证会话
   */
  async validateSession(): Promise<boolean> {
    if (this.isValidationInProgress) {
      return false;
    }

    this.isValidationInProgress = true;

    try {
      if (!this.session || !this.signClient) {
        this.clearInvalidSession();
        return false;
      }

      // 检查会话是否仍然有效
      const activeSessions = this.signClient.session.getAll();
      const sessionExists = activeSessions.some(
        (session: SessionTypes.Struct) => session.topic === this.session!.topic
      );

      if (!sessionExists) {
        console.log("[TrustWallet] Session no longer exists");
        this.clearInvalidSession();
        return false;
      }

      // 检查会话是否过期
      const now = Date.now();
      const expiry = this.session.expiry * 1000; // 转换为毫秒

      if (now >= expiry) {
        console.log("[TrustWallet] Session expired");
        this.clearInvalidSession();
        return false;
      }

      console.log("[TrustWallet] Session is valid");
      return true;
    } catch (error) {
      console.error("[TrustWallet] Error validating session:", error);
      this.clearInvalidSession();
      return false;
    } finally {
      this.isValidationInProgress = false;
    }
  }

  /**
   * 清除无效会话
   */
  clearInvalidSession(): void {
    console.log("[TrustWallet] Clearing invalid session");
    this.handleDisconnect();
  }

  /**
   * 恢复连接
   */
  private async restoreConnection(): Promise<void> {
    if (!this.session || !this.signClient) {
      return;
    }

    try {
      console.log("[TrustWallet] Restoring connection...");

      // 验证会话是否仍然有效
      const isValid = await this.validateSession();
      if (!isValid) {
        console.log(
          "[TrustWallet] Session is invalid, cannot restore connection"
        );
        return;
      }

      // 恢复连接状态
      await this.handleConnectionSuccess();

      console.log("[TrustWallet] Connection restored successfully");
    } catch (error) {
      console.error("[TrustWallet] Error restoring connection:", error);
      this.handleDisconnect();
    }
  }

  /**
   * 保存会话
   */
  private saveSession(): void {
    if (!this.session) {
      return;
    }

    try {
      const sessionData = {
        session: this.session,
        accounts: this.accounts,
        publicKey: this.publicKey,
        timestamp: Date.now(),
      };

      localStorage.setItem(TRUST_SESSION_KEY, JSON.stringify(sessionData));
      console.log("[TrustWallet] Session saved");
    } catch (error) {
      console.error("[TrustWallet] Error saving session:", error);
    }
  }

  /**
   * 恢复会话
   */
  private restoreSession(): void {
    try {
      const sessionDataStr = localStorage.getItem(TRUST_SESSION_KEY);
      if (!sessionDataStr) {
        return;
      }

      const sessionData = JSON.parse(sessionDataStr);

      // 检查会话是否过期
      const now = Date.now();
      if (now - sessionData.timestamp > SESSION_EXPIRY) {
        console.log("[TrustWallet] Stored session expired");
        this.clearSession();
        return;
      }

      this.session = sessionData.session;
      this.accounts = sessionData.accounts || [];
      this.publicKey = sessionData.publicKey;

      console.log("[TrustWallet] Session restored from storage");
    } catch (error) {
      console.error("[TrustWallet] Error restoring session:", error);
      this.clearSession();
    }
  }

  /**
   * 清除会话
   */
  private clearSession(): void {
    try {
      localStorage.removeItem(TRUST_SESSION_KEY);
      console.log("[TrustWallet] Session cleared from storage");
    } catch (error) {
      console.error("[TrustWallet] Error clearing session:", error);
    }
  }
}

export default TrustWalletAdapter;
