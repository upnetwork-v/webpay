import type {
  WalletAdapter,
  WalletCapabilities,
  WalletCallbackRequest,
  WalletCallbackResponse,
} from "@/wallets/types/wallet";
import type { Transaction } from "@solana/web3.js";

const TRUST_WALLET_STATE_KEY = "trust_wallet_state";

// Solana USDC UAI (Universal Asset ID)
const SOLANA_USDC_UAI = "c501_tEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

interface TrustWalletState {
  connected: boolean;
  lastPaymentTime?: number;
}

export class TrustWalletAdapter implements WalletAdapter {
  private _connected: boolean = false;

  capabilities: WalletCapabilities = {
    supportsSeparateSign: false, // Trust Wallet 不支持分离签名
    requiresConnect: false, // 不需要实际连接流程
    hasCallback: false, // 没有回调机制
    needsUserConfirmation: true, // 需要用户手动确认完成
  };

  constructor() {
    // 从 localStorage 恢复连接状态
    const state = this.loadState();
    if (state?.connected) {
      this._connected = true;
    }
  }

  private loadState(): TrustWalletState | null {
    const raw = localStorage.getItem(TRUST_WALLET_STATE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private saveState(state: TrustWalletState): void {
    localStorage.setItem(TRUST_WALLET_STATE_KEY, JSON.stringify(state));
  }

  async connect(): Promise<void> {
    // Trust Wallet 不需要实际的连接流程
    // 只是标记为已连接状态
    this._connected = true;
    this.saveState({ connected: true });
    console.log("[TrustWallet] Connected (state only)");
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    localStorage.removeItem(TRUST_WALLET_STATE_KEY);
    console.log("[TrustWallet] Disconnected");
  }

  isConnected(): boolean {
    return this._connected;
  }

  getPublicKey(): string | null {
    // Trust Wallet 没有 connect 流程，无法提前获取 publicKey
    // 返回 null，业务层需要处理
    return null;
  }

  // 不支持单独签名
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async signTransaction(_transaction: Transaction): Promise<Transaction> {
    throw new Error(
      "Trust Wallet does not support separate signing. Use sendPayment instead."
    );
  }

  // 不支持发送原始交易
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendRawTransaction(_signedTransaction: Transaction): Promise<string> {
    throw new Error(
      "Trust Wallet does not support sending raw transactions. Use sendPayment instead."
    );
  }

  /**
   * 发起支付（Trust Wallet 专用方法）
   * 注意：此方法只是打开 deeplink，不会返回交易哈希
   * 需要通过确认弹窗 + 轮询获取结果
   */
  async sendPayment(params: {
    to: string;
    amount: string;
    asset: string;
    memo?: string;
  }): Promise<void> {
    const urlParams = new URLSearchParams();
    urlParams.append("asset", params.asset);
    urlParams.append("address", params.to);
    urlParams.append("amount", params.amount);
    if (params.memo) {
      urlParams.append("memo", params.memo);
    }

    const deeplink = `https://link.trustwallet.com/send?${urlParams.toString()}`;

    console.log("[TrustWallet] Opening deeplink:", deeplink);

    // 记录支付时间
    this.saveState({
      connected: true,
      lastPaymentTime: Date.now(),
    });

    // 唤起 Trust Wallet
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      // 移动设备：直接跳转
      window.location.href = deeplink;
    } else {
      // 桌面浏览器：使用 a 标签
      const link = document.createElement("a");
      link.href = deeplink;
      link.target = "_self";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  async handleCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    // Trust Wallet 没有回调机制
    console.log(
      "[TrustWallet] Callback not supported, received params:",
      params
    );
    return {
      type: "none",
      success: false,
      error: "Trust Wallet does not support callbacks",
    };
  }

  /**
   * 将 Solana token 地址转换为 UAI 格式
   * @param tokenAddress Token mint 地址，null 表示 native SOL
   * @returns UAI 格式字符串
   */
  static toUAI(tokenAddress: string | null): string {
    if (!tokenAddress) {
      // Native SOL
      return "c501";
    }
    // SPL Token
    return `c501_t${tokenAddress}`;
  }

  /**
   * 获取 USDC 的 UAI
   */
  static getUsdcAsset(): string {
    return SOLANA_USDC_UAI;
  }
}
