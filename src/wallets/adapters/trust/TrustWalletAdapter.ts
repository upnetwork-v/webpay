import type {
  WalletAdapter,
  WalletCallbackRequest,
  WalletCallbackResponse,
} from "@/wallets/types/wallet";
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
   * 初始化 Trust Wallet
   */
  async init(): Promise<void> {
    if (this.signClient) {
      return;
    }

    if (!this.session) {
      return;
    }

    try {
      this.signClient = await SignClient.init({
        projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: DAPP_NAME,
          description: "Web3 Payment Platform",
          url: window.location.origin,
          icons: [DAPP_ICON],
        },
      });

      this.setupEventListeners();
    } catch (err) {
      this.signClient = null;
      this.clearSession();
      throw new Error(
        `Failed to initialize Trust Wallet: ${err instanceof Error ? err.message : String(err)}`
      );
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
      const trustDeeplink = `${TRUST_DEEPLINK_BASE}/wc?uri=${encodeURIComponent(uri)}`;
      window.location.href = trustDeeplink;
    }

    const session = await approval();

    if (!session) {
      throw new Error("Failed to establish session");
    }

    this.session = session;

    const accounts =
      this.session.namespaces[WALLETCONNECT_NAMESPACE]?.accounts || [];
    if (accounts.length > 0) {
      this.publicKey = accounts[0].split(":")[2];
    }

    if (this.publicKey) {
      this.connected = true;
      this.saveSession(this.session, this.publicKey);
    } else {
      throw new Error("Failed to extract public key from session");
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.signClient) return;

    this.signClient.on("session_delete", () => {
      this.clearSession();
    });

    this.signClient.on("session_expire", () => {
      this.clearSession();
    });
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
      this.signClient = null;
    }
  }

  /**
   * 签名交易
   */
  async signTransaction(transaction: Transaction): Promise<Transaction> {
    if (!this.connected || !this.session || !this.signClient) {
      throw new Error("Wallet not connected. Please connect first.");
    }

    if (!transaction.recentBlockhash || !transaction.feePayer) {
      throw new Error("Invalid transaction");
    }

    const serializedTransaction = transaction
      .serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })
      .toString("base64");

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

    let signature: Buffer;

    if (typeof result === "string") {
      signature = Buffer.from(result, "base64");
    } else if (result && typeof result === "object" && "signature" in result) {
      const signatureResult = result as { signature: string };
      signature = Buffer.from(signatureResult.signature, "base64");
    } else {
      throw new Error("Invalid signature result from Trust Wallet");
    }

    const signerPublicKey = new PublicKey(this.publicKey!);

    for (let i = 0; i < transaction.signatures.length; i++) {
      if (transaction.signatures[i].publicKey.equals(signerPublicKey)) {
        transaction.signatures[i].signature = signature;
        break;
      }
    }

    if (!transaction.verifySignatures()) {
      throw new Error("Transaction signature verification failed");
    }

    return transaction;
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
