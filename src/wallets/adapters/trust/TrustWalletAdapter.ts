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
import Web3 from "web3";
import WalletConnectProvider from "@walletconnect/web3-provider";
import Web3Modal from "web3modal";

// 内联常量定义
const SOLANA_NETWORK = 501; // Solana SLIP-44
const TRUST_METHODS = {
  SIGN_TRANSACTION: "trust_signTransaction",
  GET_ACCOUNTS: "get_accounts",
} as const;
const TRUST_SESSION_KEY = "trust_wallet_session";
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// 移除未使用的配置常量

// 全局 Web3Modal 实例管理
let globalWeb3Modal: Web3Modal | null = null;
let globalInitPromise: Promise<Web3Modal> | null = null;

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
 * Trust Wallet 适配器 - Web3Modal 实现
 */
export class TrustWalletAdapter implements TrustWalletAdapterExtended {
  private web3Modal: Web3Modal | null = null;
  private provider: WalletConnectProvider | null = null;
  private web3: Web3 | null = null;
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
    if (this.isInitialized && this.web3Modal) {
      return;
    }

    try {
      // 使用全局实例，避免重复初始化 Web3Modal
      if (globalWeb3Modal) {
        console.log("[TrustWallet] Using existing Web3Modal instance");
        this.web3Modal = globalWeb3Modal;
      } else if (globalInitPromise) {
        console.log(
          "[TrustWallet] Waiting for existing Web3Modal initialization..."
        );
        this.web3Modal = await globalInitPromise;
      } else {
        console.log("[TrustWallet] Initializing new Web3Modal...");
        globalInitPromise = this.initializeWeb3Modal();
        this.web3Modal = await globalInitPromise;
        globalWeb3Modal = this.web3Modal;
        globalInitPromise = null;
      }

      this.isInitialized = true;

      // 检查是否有现有连接
      if (this.web3Modal.cachedProvider) {
        await this.restoreConnection();
      }

      console.log("[TrustWallet] Initialization completed successfully");
    } catch (err) {
      this.web3Modal = null;
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
   * 初始化 Web3Modal
   */
  private async initializeWeb3Modal(): Promise<Web3Modal> {
    // 获取 Solana RPC 端点
    const solanaRpc = import.meta.env.VITE_SOLANA_RPC;
    if (!solanaRpc) {
      throw new TrustWalletError(
        TrustWalletErrorType.INITIALIZATION_FAILED,
        "VITE_SOLANA_RPC environment variable is not set"
      );
    }

    // 配置 Trust Wallet 提供商 - 只支持 Solana 主网
    const providerOptions = {
      walletconnect: {
        package: WalletConnectProvider,
        options: {
          rpc: {
            501: solanaRpc, // Solana mainnet - 使用环境变量
          },
          chainId: 501, // Solana 主网作为默认链
          bridge: "https://bridge.walletconnect.org",
        },
      },
    };

    const web3Modal = new Web3Modal({
      network: "mainnet",
      cacheProvider: true,
      providerOptions,
    });

    return web3Modal;
  }

  /**
   * 恢复现有连接
   */
  private async restoreConnection(): Promise<void> {
    try {
      console.log("[TrustWallet] Restoring existing connection...");

      if (!this.web3Modal?.cachedProvider) {
        console.log("[TrustWallet] No cached provider found");
        return;
      }

      // 连接到缓存的提供商
      const provider = await this.web3Modal.connectTo("walletconnect");
      await this.setupProvider(provider);

      console.log(
        "[TrustWallet] Connection restored successfully:",
        this.publicKey
      );
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

    if (!this.web3Modal) {
      await this.init();
    }

    try {
      console.log("[TrustWallet] Connecting via Web3Modal...");

      // 连接到 Trust Wallet (通过 WalletConnect)
      const provider = await this.web3Modal!.connectTo("walletconnect");
      await this.setupProvider(provider);

      console.log("[TrustWallet] Connection successful:", this.publicKey);
    } catch (error) {
      console.error("[TrustWallet] Connection failed:", error);

      // 检查是否是用户拒绝
      if (error instanceof Error && error.message.includes("User rejected")) {
        throw new TrustWalletError(
          TrustWalletErrorType.USER_REJECTED,
          "Connection was rejected by user",
          error
        );
      }

      throw error;
    }
  }

  /**
   * 设置提供商
   */
  private async setupProvider(provider: WalletConnectProvider): Promise<void> {
    this.provider = provider as WalletConnectProvider;
    this.web3 = new Web3(this.provider);

    // 监听账户变化
    this.provider.on("accountsChanged", (accounts: string[]) => {
      console.log("[TrustWallet] Accounts changed:", accounts);
      if (accounts.length > 0) {
        this.publicKey = accounts[0];
        this.saveSession();
      } else {
        this.clearSession();
      }
    });

    // 监听网络变化
    this.provider.on("chainChanged", (chainId: number) => {
      console.log("[TrustWallet] Chain changed:", chainId);
    });

    // 监听断开连接
    this.provider.on("disconnect", (code: number, reason: string) => {
      console.log("[TrustWallet] Disconnected:", code, reason);
      this.clearSession();
    });

    // 获取账户
    const accounts = await this.web3.eth.getAccounts();
    if (accounts.length > 0) {
      this.publicKey = accounts[0];
      this.connected = true;
      this.saveSession();
    }

    // 获取 Solana 账户（通过 Trust Wallet 扩展方法）
    await this.getAccounts();
  }

  /**
   * 获取 Solana 账户列表
   */
  private async getAccounts(): Promise<void> {
    if (!this.provider) {
      throw new Error("Provider not initialized");
    }

    try {
      // 使用 Trust Wallet 扩展的 get_accounts 方法
      const result = await this.provider.send({
        method: TRUST_METHODS.GET_ACCOUNTS,
        params: [],
      });

      console.log("[TrustWallet] Accounts received:", result);

      if (Array.isArray(result)) {
        // 只保留 Solana 账户 (network: 501)
        this.accounts = result.filter(
          (account) => account.network === SOLANA_NETWORK
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
    if (!this.connected || !this.provider) {
      throw new TrustWalletError(
        TrustWalletErrorType.SESSION_NOT_FOUND,
        "Wallet not connected. Please connect first."
      );
    }

    // 在签名前验证连接是否仍然有效
    if (!this.provider.connected) {
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
      const result = await this.provider.send({
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
    if (!this.provider || !this.connected) {
      console.log("[TrustWallet] No provider or not connected to validate");
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
      if (!this.provider.connected) {
        console.log("[TrustWallet] Provider not connected");
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
      if (this.provider) {
        await this.provider.disconnect();
      }
      if (this.web3Modal) {
        await this.web3Modal.clearCachedProvider();
      }
    } catch (error) {
      console.warn("Error disconnecting Trust Wallet:", error);
    } finally {
      this.clearSession();
      this.provider = null;
      this.web3 = null;
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
        message: "Trust Wallet callback handled via Web3Modal",
        params: params,
      } as unknown,
    };
  }
}
