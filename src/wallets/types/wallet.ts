import type { Transaction } from "@solana/web3.js";

export type WalletType = "phantom"; // 未来可扩展 'okx' | 'metamask' 等

export interface WalletAdapter {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (transaction: Transaction) => Promise<string>;
  isConnected: () => boolean;
  getPublicKey: () => string | null;
}

export interface WalletState {
  walletType: WalletType | null;
  isConnected: boolean;
  publicKey: string | null;
  error: string | null;
  isLoading: boolean;
}

export interface WalletContextProps {
  state: WalletState;
  selectWallet: (type: WalletType) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (transaction: Transaction) => Promise<string>;
  handleConnectCallback: (
    phantomPk: string,
    nonce: string,
    data: string
  ) => boolean;
  getDappKeyPair: () => nacl.BoxKeyPair | null;
}
