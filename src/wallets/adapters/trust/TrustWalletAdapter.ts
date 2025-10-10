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
  SIGN_MESSAGE: "solana_signMessage", // 添加消息签名方法
  REQUEST_ACCOUNTS: "solana_requestAccounts", // 使用 WalletConnect 官方推荐的方法
  GET_ACCOUNTS: "solana_getAccounts", // 备用方法
} as const;

// 账户类型定义
interface TrustWalletAccount {
  address: string;
  network?: number;
  chainId?: string;
}
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
  private accounts: TrustWalletAccount[] = [];
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

      // 如果当前会话被更新，重新获取账户信息
      if (this.session && event.topic === this.session.topic) {
        console.log("[TrustWallet] Updating session with new data");

        // 更新会话数据
        if (this.signClient) {
          const updatedSession = this.signClient.session.get(event.topic);
          if (updatedSession) {
            this.session = updatedSession;
          }
        }

        // 重新获取账户信息
        this.getAccounts().catch((error) => {
          console.error(
            "[TrustWallet] Error updating accounts after session update:",
            error
          );
        });
      }
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
              TRUST_METHODS.SIGN_MESSAGE,
              TRUST_METHODS.REQUEST_ACCOUNTS,
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
      console.log(
        "[TrustWallet] Session namespaces:",
        JSON.stringify(this.session.namespaces, null, 2)
      );

      // 打印 Trust Wallet 实际支持的方法
      if (this.session.namespaces.solana) {
        console.log(
          "[TrustWallet] Trust Wallet supports Solana methods:",
          this.session.namespaces.solana.methods
        );
        console.log(
          "[TrustWallet] Trust Wallet supports Solana chains:",
          this.session.namespaces.solana.chains
        );
      } else {
        console.warn(
          "[TrustWallet] Trust Wallet does not support Solana namespace"
        );
        console.log(
          "[TrustWallet] Supported namespaces:",
          Object.keys(this.session.namespaces)
        );
      }

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
      console.log("[TrustWallet] Handling connection success...");
      console.log("[TrustWallet] Session data:", {
        topic: this.session.topic,
        namespaces: this.session.namespaces,
        expiry: this.session.expiry,
      });

      // 获取账户信息
      await this.getAccounts();

      // 验证是否成功获取到公钥
      if (!this.publicKey) {
        console.error(
          "[TrustWallet] Failed to extract public key from session"
        );
        console.log(
          "[TrustWallet] Session namespaces:",
          this.session.namespaces
        );
        console.log("[TrustWallet] Available accounts:", this.accounts);
        throw new Error(
          "Failed to extract public key from Trust Wallet session"
        );
      }

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

    // 从会话命名空间获取账户信息 - 基于截图数据格式
    if (
      this.session.namespaces &&
      this.session.namespaces.solana &&
      this.session.namespaces.solana.accounts
    ) {
      console.log(
        "[TrustWallet] Found accounts in session namespace:",
        this.session.namespaces.solana.accounts
      );

      for (const account of this.session.namespaces.solana.accounts) {
        console.log("[TrustWallet] Processing session account:", account);

        // 解析账户字符串，格式是 "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:address"
        const parts = account.split(":");

        if (parts.length < 3) {
          throw new Error(`Invalid account format: ${account}`);
        }

        const namespace = parts[0]; // "solana"
        const chainId = parts[1]; // "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
        const address = parts.slice(2).join(":"); // 处理地址中可能包含冒号的情况

        console.log("[TrustWallet] Parsed account:", {
          namespace,
          chainId,
          address,
          expectedChainId: SOLANA_MAINNET_CHAIN_ID.split(":")[1],
        });

        // 验证命名空间
        if (namespace !== "solana") {
          throw new Error(
            `Invalid namespace: expected 'solana', got '${namespace}'`
          );
        }

        // 验证链 ID 是否匹配
        if (chainId !== SOLANA_MAINNET_CHAIN_ID.split(":")[1]) {
          throw new Error(
            `Chain ID mismatch: expected '${SOLANA_MAINNET_CHAIN_ID.split(":")[1]}', got '${chainId}'`
          );
        }

        // 验证是否为有效的 Solana 地址
        try {
          new PublicKey(address);
        } catch {
          throw new Error(`Invalid Solana address: ${address}`);
        }

        // 添加到账户列表
        this.accounts.push({
          address: address,
          chainId: SOLANA_MAINNET_CHAIN_ID,
          network: SOLANA_SLIP44,
        });

        console.log(
          "[TrustWallet] Found valid Solana account from session:",
          address
        );
      }

      // 设置第一个账户为当前公钥
      if (this.accounts.length > 0) {
        this.publicKey = this.accounts[0].address;
        console.log(
          "[TrustWallet] Using account from session:",
          this.publicKey
        );
      } else {
        throw new Error("No valid Solana accounts found in session namespace");
      }
    } else {
      throw new Error("No solana namespace found in session");
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
      console.log("[TrustWallet] Requesting transaction signature...");
      console.log("[TrustWallet] Transaction details:", {
        recentBlockhash: transaction.recentBlockhash,
        feePayer: transaction.feePayer?.toString(),
        signatures: transaction.signatures.length,
        instructions: transaction.instructions.length,
      });

      // 根据 WalletConnect Solana 官方规范，使用正确的参数格式
      const serializedTransaction = transaction
        .serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
        .toString("base64");

      console.log(
        "[TrustWallet] Using official WalletConnect Solana format..."
      );
      console.log(
        "[TrustWallet] Transaction serialized length:",
        serializedTransaction.length
      );
      console.log("[TrustWallet] User public key:", this.publicKey);

      const result = await this.signClient.request({
        topic: this.session.topic,
        chainId: SOLANA_MAINNET_CHAIN_ID,
        request: {
          method: "solana_signTransaction",
          params: {
            transaction: serializedTransaction,
            pubkey: this.publicKey,
          },
        },
      });

      console.log("[TrustWallet] Received signature result:", {
        type: typeof result,
        isString: typeof result === "string",
        isObject: typeof result === "object" && result !== null,
        result: result,
      });

      // Trust Wallet 返回的是包含签名的 JSON 对象
      console.log("[TrustWallet] Processing signature result...");

      // 只支持 Trust Wallet 实际返回的格式：{signature: "base64_string"}
      if (!result || typeof result !== "object" || !("signature" in result)) {
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          `Invalid signature result from Trust Wallet. Expected object with 'signature' field, got: ${typeof result}`
        );
      }

      const signatureString = (result as { signature: string }).signature;

      if (typeof signatureString !== "string") {
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          `Invalid signature type. Expected string, got: ${typeof signatureString}`
        );
      }

      console.log("[TrustWallet] Signature length:", signatureString.length);

      // 将签名添加到原始交易中
      const signatureBuffer = Buffer.from(signatureString, "base64");
      console.log(
        "[TrustWallet] Signature buffer length:",
        signatureBuffer.length,
        "bytes"
      );
      console.log(
        "[TrustWallet] Signature buffer hex:",
        signatureBuffer.toString("hex")
      );

      // 处理签名格式：Trust Wallet 返回 65 字节，去掉第一个字节转换为 64 字节
      let solanaSignature: Buffer;

      if (signatureBuffer.length === 64) {
        // 标准的 64 字节 ed25519 签名
        solanaSignature = signatureBuffer;
        console.log("[TrustWallet] Using 64-byte signature");
      } else if (signatureBuffer.length === 65) {
        // Trust Wallet 返回 65 字节签名，去掉第一个字节
        solanaSignature = signatureBuffer.slice(1);
        console.log(
          "[TrustWallet] Converted 65-byte signature to 64-byte format"
        );
        console.log(
          "[TrustWallet] First byte (removed):",
          signatureBuffer[0].toString(16)
        );
        console.log(
          "[TrustWallet] Final signature hex:",
          solanaSignature.toString("hex")
        );
      } else {
        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          `Invalid signature length: expected 64 or 65 bytes, got ${signatureBuffer.length} bytes`
        );
      }

      console.log(
        "[TrustWallet] Final signature length:",
        solanaSignature.length,
        "bytes"
      );

      const userPublicKey = new PublicKey(this.publicKey!);
      console.log("[TrustWallet] User public key:", userPublicKey.toString());

      // 检查交易状态
      console.log("[TrustWallet] Transaction before adding signature:");
      console.log("  - Signatures count:", transaction.signatures.length);
      console.log("  - Fee payer:", transaction.feePayer?.toString());
      console.log("  - Recent blockhash:", transaction.recentBlockhash);

      transaction.addSignature(userPublicKey, solanaSignature);

      console.log("[TrustWallet] Successfully added signature to transaction");
      console.log(
        "[TrustWallet] Transaction signatures count:",
        transaction.signatures.length
      );

      // 检查添加签名后的状态
      const addedSignature = transaction.signatures.find((sig) =>
        sig.publicKey.equals(userPublicKey)
      );
      if (addedSignature && addedSignature.signature) {
        console.log("[TrustWallet] Added signature details:");
        console.log("  - Public key:", addedSignature.publicKey.toString());
        console.log(
          "  - Signature length:",
          addedSignature.signature.length,
          "bytes"
        );
        console.log(
          "  - Signature hex:",
          addedSignature.signature.toString("hex")
        );
      } else {
        console.error("[TrustWallet] Could not find added signature!");
      }

      // 验证签名
      console.log("[TrustWallet] Starting signature verification...");
      const isValid = transaction.verifySignatures();
      console.log("[TrustWallet] Signature verification result:", isValid);

      if (!isValid) {
        console.error("[TrustWallet] Signature verification failed!");
        console.error("[TrustWallet] Transaction details:", {
          signatures: transaction.signatures.map((sig) => ({
            publicKey: sig.publicKey.toString(),
            signatureLength: sig.signature?.length || 0,
            signatureHex: sig.signature?.toString("hex") || "null",
          })),
          feePayer: transaction.feePayer?.toString(),
          recentBlockhash: transaction.recentBlockhash,
        });

        throw new TrustWalletError(
          TrustWalletErrorType.SIGNATURE_FAILED,
          "Signature verification failed"
        );
      }

      console.log("[TrustWallet] Transaction successfully signed and verified");
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
