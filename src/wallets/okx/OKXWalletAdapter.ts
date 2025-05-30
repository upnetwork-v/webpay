import type { WalletAdapter, WalletAccount } from "../types";
import { Transaction, VersionedTransaction } from "@solana/web3.js";

declare global {
  interface Window {
    okxwallet?: {
      solana?: {
        isOKXWallet?: boolean;
        connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
        disconnect: () => Promise<void>;
        signAndSendTransaction: (transaction: any) => Promise<{ signature: string }>;
        signTransaction: (transaction: any) => Promise<any>;
        signAllTransactions: (transactions: any[]) => Promise<any[]>;
        on: (event: string, callback: (args: any) => void) => void;
        off: (event: string, callback: (args: any) => void) => void;
        isConnected: boolean;
        publicKey: { toString: () => string } | null;
      };
    };
  }
}

interface OKXWalletConfig {
  chainId?: number;
  network?: 'mainnet' | 'testnet' | 'devnet';
}

export class OKXWalletAdapter implements WalletAdapter {
  name = "OKX";
  icon = "/wallets/okx.svg";
  private _publicKey: string | null = null;
  private _listeners: { [event: string]: Array<(data: any) => void> } = {};
  private _config: OKXWalletConfig;
  private _initialized: boolean = false;

  constructor(config: OKXWalletConfig = {}) {
    this._config = {
      chainId: config.chainId || 101, // Default to Solana mainnet
      network: config.network || 'mainnet',
    };
  }

  static isAvailable(): boolean {
    return (
      typeof window !== "undefined" && 
      (!!window.okxwallet?.solana?.isOKXWallet || 
       /OKXApp/.test(navigator.userAgent))
    );
  }

  isInstalled(): boolean {
    return OKXWalletAdapter.isAvailable();
  }

  private async initialize() {
    if (this._initialized) return;
    
    if (typeof window === 'undefined') {
      throw new Error('OKX Wallet is not available in this environment');
    }

    // Load OKX SDK if not already loaded
    if (!window.okxwallet) {
      try {
        // Dynamically load the OKX SDK
        await this.loadOKXSDK();
      } catch (error) {
        console.error('Failed to load OKX SDK:', error);
        throw new Error('Failed to initialize OKX Wallet');
      }
    }
    
    this._initialized = true;
  }

  private async loadOKXSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.okxwallet) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://www.okx.com/download/okx-wallet-js/okxwallet.js';
      script.async = true;
      script.onload = () => {
        if (window.okxwallet) {
          resolve();
        } else {
          reject(new Error('OKX Wallet SDK failed to load'));
        }
      };
      script.onerror = () => {
        reject(new Error('Failed to load OKX Wallet SDK'));
      };
      document.head.appendChild(script);
    });
  }

  private isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  async connect(): Promise<WalletAccount> {
    try {
      await this.initialize();
      
      const provider = window.okxwallet?.solana;
      if (!provider) {
        throw new Error('OKX Wallet provider not found');
      }

      // For mobile, we'll use the OKX app's deeplink
      if (this.isMobile() && !provider.isConnected) {
        // OKX mobile handles the connection through the app
        // The app will redirect back to the dapp after connection
        const response = await provider.connect({
          onlyIfTrusted: false,
          // @ts-ignore - OKX specific options
          chainId: this._config.chainId,
          network: this._config.network,
        });
        
        if (response?.publicKey) {
          this._publicKey = response.publicKey.toString();
        } else {
          throw new Error('Failed to connect to OKX Wallet');
        }
      } else {
        // For extension
        const response = await provider.connect({ onlyIfTrusted: false });
        this._publicKey = response.publicKey.toString();
      }

      // Set up event listeners
      provider.on("accountChanged", this.handleAccountChanged);
      provider.on("disconnect", this.handleDisconnect);
      provider.on("connect", this.handleConnect);

      this.emit("connect", { publicKey: this._publicKey });

      return {
        address: this._publicKey,
        publicKey: this._publicKey,
      };
    } catch (error) {
      console.error("Failed to connect to OKX Wallet:", error);
      this.emit("error", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const provider = window.okxwallet?.solana;
    if (provider) {
      try {
        await provider.disconnect();
      } catch (error) {
        console.error("Failed to disconnect from OKX Wallet:", error);
        this.emit("error", error);
      } finally {
        this._publicKey = null;
        this.emit("disconnect");
      }
    }
  }

  async signTransaction(transaction: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction> {
    if (!this._publicKey) {
      throw new Error("Wallet not connected");
    }

    const provider = window.okxwallet?.solana;
    if (!provider) {
      throw new Error("OKX Wallet provider not found");
    }

    try {
      return await provider.signTransaction(transaction);
    } catch (error) {
      console.error("Failed to sign transaction:", error);
      this.emit("error", error);
      throw error;
    }
  }

  async signAllTransactions(transactions: (Transaction | VersionedTransaction)[]): Promise<(Transaction | VersionedTransaction)[]> {
    if (!this._publicKey) {
      throw new Error("Wallet not connected");
    }

    const provider = window.okxwallet?.solana;
    if (!provider?.signAllTransactions) {
      throw new Error("OKX Wallet provider does not support signAllTransactions");
    }

    try {
      return await provider.signAllTransactions(transactions);
    } catch (error) {
      console.error("Failed to sign transactions:", error);
      this.emit("error", error);
      throw error;
    }
  }

  async sendTransaction(transaction: Transaction | VersionedTransaction): Promise<{ signature: string }> {
    if (!this._publicKey) {
      throw new Error("Wallet not connected");
    }

    const provider = window.okxwallet?.solana;
    if (!provider) {
      throw new Error("OKX Wallet provider not found");
    }

    try {
      const { signature } = await provider.signAndSendTransaction(transaction);
      this.emit("sendTransaction", { signature });
      return { signature };
    } catch (error) {
      console.error("Failed to send transaction:", error);
      this.emit("error", error);
      throw error;
    }
  }

  async getAccount(): Promise<WalletAccount | null> {
    if (!this._publicKey) return null;
    return {
      address: this._publicKey,
      publicKey: this._publicKey,
    };
  }

  on(event: string, callback: (data: any) => void): () => void {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event: string, callback: (data: any) => void): void {
    if (!this._listeners[event]) return;
    const index = this._listeners[event].indexOf(callback);
    if (index > -1) {
      this._listeners[event].splice(index, 1);
    }
  }

  private emit(event: string, data?: any): void {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach((callback) => callback(data));
  }

  private handleAccountChanged = (newPublicKey: any) => {
    this._publicKey = newPublicKey ? newPublicKey.toString() : null;
    this.emit("accountChanged", { publicKey: this._publicKey });
  };

  private handleDisconnect = () => {
    this._publicKey = null;
    this.emit("disconnect");
  };

  private handleConnect = () => {
    const provider = window.okxwallet?.solana;
    if (provider?.publicKey) {
      this._publicKey = provider.publicKey.toString();
      this.emit("connect", { publicKey: this._publicKey });
    }
  };
}
