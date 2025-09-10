import type { Transaction } from "@solana/web3.js";

export type WalletType = "phantom" | "okx"; // 未来可扩展更多钱包

export interface WalletAdapter {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (transaction: Transaction) => Promise<string>;
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
  signAndSendTransaction: (transaction: Transaction) => Promise<string>;
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
