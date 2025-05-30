import type { WalletAdapter, WalletAccount } from "../types";

declare global {
  interface Window {
    phantom?: {
      solana?: {
        isPhantom?: boolean;
        connect: (options?: {
          onlyIfTrusted?: boolean;
        }) => Promise<{ publicKey: { toString: () => string } }>;
        disconnect: () => Promise<void>;
        signAndSendTransaction: (
          transaction: any
        ) => Promise<{ signature: string }>;
        on: (event: string, callback: (args: any) => void) => void;
        off: (event: string, callback: (args: any) => void) => void;
      };
    };
  }
}

export class PhantomWalletAdapter implements WalletAdapter {
  name = "Phantom";
  icon = "/wallets/phantom.svg";
  private _publicKey: string | null = null;
  private _listeners: { [event: string]: Array<(data: any) => void> } = {};

  static isAvailable(): boolean {
    return typeof window !== "undefined" && !!window.phantom?.solana?.isPhantom;
  }

  isInstalled(): boolean {
    return PhantomWalletAdapter.isAvailable();
  }

  async connect(): Promise<WalletAccount> {
    if (!this.isInstalled()) {
      throw new Error("Phantom wallet is not installed");
    }

    const provider = window.phantom?.solana;
    if (!provider) {
      throw new Error("Phantom provider not found");
    }

    try {
      const response = await provider.connect({ onlyIfTrusted: false });
      this._publicKey = response.publicKey.toString();

      // Set up event listeners
      provider.on("accountChanged", this.handleAccountChanged);
      provider.on("disconnect", this.handleDisconnect);

      return {
        address: this._publicKey,
        publicKey: this._publicKey,
      };
    } catch (error) {
      console.error("Failed to connect to Phantom:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const provider = window.phantom?.solana;
    if (provider) {
      try {
        await provider.disconnect();
      } catch (error) {
        console.error("Failed to disconnect from Phantom:", error);
      } finally {
        this._publicKey = null;
        this.emit("disconnect");
      }
    }
  }

  async sendTransaction(transaction: any): Promise<{ signature: string }> {
    if (!this._publicKey) {
      throw new Error("Wallet not connected");
    }

    const provider = window.phantom?.solana;
    if (!provider) {
      throw new Error("Phantom provider not found");
    }

    try {
      const { signature } = await provider.signAndSendTransaction(transaction);
      return { signature };
    } catch (error) {
      console.error("Failed to send transaction:", error);
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

  on(event: string, callback: (data: any) => void): void {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
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

  private handleAccountChanged = (newPublicKey: string) => {
    this._publicKey = newPublicKey;
    this.emit("accountChanged", { publicKey: newPublicKey });
  };

  private handleDisconnect = () => {
    this._publicKey = null;
    this.emit("disconnect");
  };
}
