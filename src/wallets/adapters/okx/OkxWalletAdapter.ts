import type { WalletAdapter, PaymentRequest } from "@/wallets/types/wallet";
import {
  createSolTransferTransaction,
  createSPLTransferTransaction,
} from "@/utils/transaction";
import { OKXUniversalProvider } from "@okxconnect/universal-provider";
import { OKXSolanaProvider } from "@okxconnect/solana-provider";
import { DAPP_NAME, DAPP_ICON } from "@/wallets/utils/dapp";
import type {
  WalletCallbackRequest,
  WalletCallbackResponse,
} from "@/wallets/types/wallet";

const OKX_SESSION_KEY = "okx_wallet_session";
const OKX_CHAIN_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // mainnet，可根据需要调整

export class OkxWalletAdapter implements WalletAdapter {
  private universalProvider: any = null;
  private solanaProvider: any = null;
  private _session: any = null;
  private publicKey: string | null = null;
  private connected: boolean = false;

  constructor() {
    // 只做 session 标记，不做异步初始化
    const sessionRaw = localStorage.getItem(OKX_SESSION_KEY);
    if (sessionRaw) {
      try {
        this._session = JSON.parse(sessionRaw);
        this.connected = true;
      } catch {
        this._session = null;
        this.connected = false;
      }
    }
  }

  async init(): Promise<void> {
    if (!this.universalProvider) {
      this.universalProvider = await OKXUniversalProvider.init({
        dappMetaData: { name: DAPP_NAME, icon: DAPP_ICON },
      });
      this.solanaProvider = new OKXSolanaProvider(this.universalProvider);
    }
    // 恢复 publicKey
    try {
      const account = this.solanaProvider.getAccount(OKX_CHAIN_ID);
      this.publicKey = account?.address || null;
      this.connected = !!this.publicKey;
    } catch {
      this.publicKey = null;
      this.connected = false;
    }
  }

  async connect(): Promise<void> {
    if (!this.universalProvider) {
      this.universalProvider = await OKXUniversalProvider.init({
        dappMetaData: {
          name: DAPP_NAME,
          icon: DAPP_ICON,
        },
      });
    }
    // 连接钱包
    const session = await this.universalProvider.connect({
      namespaces: {
        solana: {
          chains: [OKX_CHAIN_ID],
        },
      },
      //   sessionConfig: {
      //     redirect: window.location.href,
      //   },
    });
    this._session = session;
    localStorage.setItem(OKX_SESSION_KEY, JSON.stringify(session));
    this.solanaProvider = new OKXSolanaProvider(this.universalProvider);
    // 获取账户
    const account = this.solanaProvider.getAccount(OKX_CHAIN_ID);
    this.publicKey = account?.address || null;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.universalProvider) {
      await this.universalProvider.disconnect();
    }
    this.universalProvider = null;
    this.solanaProvider = null;
    this._session = null;
    this.publicKey = null;
    this.connected = false;
    localStorage.removeItem(OKX_SESSION_KEY);
  }

  isConnected(): boolean {
    return this.connected;
  }

  getPublicKey(): string | null {
    return this.publicKey;
  }

  getSession(): any {
    return this._session;
  }

  /**
   * 使用现有的公共方法构建交易
   */
  private async buildTransaction(request: PaymentRequest) {
    if (!this.publicKey) {
      throw new Error("No sender public key available");
    }

    console.log("[OKXWalletAdapter] Building transaction:", request);

    if (
      !request.tokenMint ||
      request.tokenMint === "So11111111111111111111111111111111111111112"
    ) {
      // SOL 转账
      return await createSolTransferTransaction({
        from: this.publicKey,
        to: request.recipientAddress,
        tokenAmount: request.amount,
        orderId: request.orderId,
      });
    } else {
      // SPL Token 转账
      return await createSPLTransferTransaction({
        from: this.publicKey,
        to: request.recipientAddress,
        tokenAmount: request.amount,
        tokenAddress: request.tokenMint,
        orderId: request.orderId,
      });
    }
  }

  async signAndSendTransaction(request: PaymentRequest): Promise<string> {
    if (!this.solanaProvider) {
      throw new Error("Wallet not connected");
    }

    console.log("[OKXWalletAdapter] signAndSendTransaction:", request);

    // 构建交易
    const transaction = await this.buildTransaction(request);

    const txHash = await this.solanaProvider.signAndSendTransaction(
      transaction,
      OKX_CHAIN_ID
    );
    return txHash;
  }

  async handleCallback(_params: Record<string, string>) {
    // OKX 钱包一般通过 session 恢复，不需要特殊回调处理
    // 可根据需要扩展
    return {
      type: "connect",
      success: this.connected,
      data: { publicKey: this.publicKey },
    };
  }
}
