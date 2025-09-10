import type { WalletAdapter } from "@/wallets/types/wallet";
import type { Transaction } from "@solana/web3.js";
import { OKXUniversalProvider } from "@okxconnect/universal-provider";
import { OKXSolanaProvider } from "@okxconnect/solana-provider";
import { DAPP_NAME, DAPP_ICON } from "@/wallets/utils/dapp";

const OKX_SESSION_KEY = "okx_wallet_session";
const OKX_CHAIN_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"; // mainnet，可根据需要调整

export class OkxWalletAdapter implements WalletAdapter {
  private universalProvider: any = null;
  private solanaProvider: any = null;
  private session: any = null;
  private publicKey: string | null = null;
  private connected: boolean = false;

  constructor() {
    // 只做 session 标记，不做异步初始化
    const sessionRaw = localStorage.getItem(OKX_SESSION_KEY);
    if (sessionRaw) {
      try {
        this.session = JSON.parse(sessionRaw);
        this.connected = true;
      } catch {
        this.session = null;
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
    this.session = session;
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
    this.session = null;
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

  async signAndSendTransaction(transaction: Transaction): Promise<string> {
    if (!this.solanaProvider) {
      throw new Error("Wallet not connected");
    }
    const txHash = await this.solanaProvider.signAndSendTransaction(
      transaction,
      OKX_CHAIN_ID
    );
    return txHash.signature;
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

  getSession(): any {
    return this.session;
  }
}
