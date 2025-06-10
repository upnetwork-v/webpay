// Transaction import removed as we now use PaymentRequest instead

export type WalletType = "phantom" | "okx" | "trust"; // 支持 Trust Wallet

// 支付请求接口
export interface PaymentRequest {
  recipientAddress: string;
  amount: string;
  decimal: number;
  tokenMint?: string; // SPL token mint address, undefined for SOL
  orderId: string;
}

export interface WalletAdapter {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (request: PaymentRequest) => Promise<string>;
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
  signAndSendTransaction: (request: PaymentRequest) => Promise<string>;
  handleConnectCallback: (
    params: WalletCallbackRequest
  ) => Promise<WalletCallbackResponse>;
  handlePaymentCallback: (
    params: WalletCallbackRequest
  ) => Promise<WalletCallbackResponse>;
  adapter: WalletAdapter | null;
  openWalletSelector: () => void;
  closeWalletSelector: () => void;
}

export interface WalletOption {
  type: WalletType;
  name: string;
  icon: React.ReactNode;
}
