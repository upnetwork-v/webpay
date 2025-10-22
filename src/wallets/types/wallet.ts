import type { Transaction } from "@solana/web3.js";

export type WalletType = "phantom" | "okx" | "trust";

export interface WalletCapabilities {
  supportsSeparateSign: boolean; // 是否支持分离签名
  requiresConnect: boolean; // 是否需要连接流程
  hasCallback: boolean; // 是否有回调机制
  needsUserConfirmation: boolean; // 是否需要用户确认
}

export interface WalletAdapter {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  sendRawTransaction: (signedTransaction: Transaction) => Promise<string>;

  // Trust Wallet 专用：一步完成的支付方法（可选）
  sendPayment?: (params: {
    to: string;
    amount: string;
    asset: string;
    memo?: string;
  }) => Promise<void>;

  // 钱包能力标识
  capabilities: WalletCapabilities;

  isConnected: () => boolean;
  getPublicKey: () => string | null;
  handleCallback: (
    params: WalletCallbackRequest
  ) => Promise<WalletCallbackResponse>;
}

export interface WalletState {
  walletType: WalletType | null;
  isConnected: boolean;
  publicKey: string | null;
  error: string | null;
  isLoading: boolean;
}

export interface WalletCallbackResponse {
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
export interface WalletCallbackRequest {
  [key: string]: string;
}

export interface WalletContextProps {
  state: WalletState;
  selectWallet: (type: WalletType) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  sendRawTransaction: (signedTransaction: Transaction) => Promise<string>;
  handleConnectCallback: (
    params: WalletCallbackRequest
  ) => Promise<WalletCallbackResponse>;
  handlePaymentCallback: (
    params: WalletCallbackRequest
  ) => Promise<WalletCallbackResponse>;

  // Trust Wallet 专用支付方法
  sendTrustWalletPayment: (
    params: {
      to: string;
      amount: string;
      asset: string;
      memo?: string;
    },
    onConfirmed: () => void
  ) => Promise<void>;

  adapter: WalletAdapter | null;
  openWalletSelector: () => void;
  closeWalletSelector: () => void;
}

export interface WalletOption {
  type: WalletType;
  name: string;
  icon: React.ReactNode;
}
