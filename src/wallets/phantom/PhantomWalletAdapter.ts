import type { WalletAdapter, WalletAccount } from "../types";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import * as nacl from 'tweetnacl';

const PHANTOM_DEEP_LINK_BASE = 'https://phantom.app/ul/v1/';

declare global {
  interface Window {
    phantom?: {
      solana?: {
        isPhantom?: boolean;
        connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
        disconnect: () => Promise<void>;
        signAndSendTransaction: (transaction: any) => Promise<{ signature: string }>;
        on: (event: string, callback: (args: any) => void) => void;
        off: (event: string, callback: (args: any) => void) => void;
        isConnected: boolean;
        publicKey: { toString: () => string } | null;
      };
    };
  }
}

export class PhantomWalletAdapter implements WalletAdapter {
  name = "Phantom";
  icon = "/wallets/phantom.svg";
  private _publicKey: string | null = null;
  private _listeners: { [event: string]: Array<(data: any) => void> } = {};
  private _dappKeyPair: nacl.BoxKeyPair | null = null;
  private _phantomEncryptionPublicKey: string | null = null;
  private _phantomSession: string | null = null;
  private _redirectUrl: string = '';

  static isAvailable(): boolean {
    // Always return true for mobile to allow deeplink fallback
    return true;
  }

  isInstalled(): boolean {
    return PhantomWalletAdapter.isAvailable();
  }

  private generateDappKeyPair(): nacl.BoxKeyPair {
    return nacl.box.keyPair();
  }

  private async connectPhantomMobile(): Promise<WalletAccount> {
    // Generate a new key pair for this session
    this._dappKeyPair = this.generateDappKeyPair();
    
    // Store the session token
    this._phantomSession = Math.random().toString(36).substring(2, 15);
    
    // Set redirect URL for the callback
    this._redirectUrl = `${window.location.origin}${window.location.pathname}`;
    
    // Create deeplink URL for Phantom mobile
    const connectUrl = new URL('connect', PHANTOM_DEEP_LINK_BASE);
    connectUrl.searchParams.append('dapp_encryption_public_key', 
      Buffer.from(this._dappKeyPair.publicKey).toString('base64'));
    connectUrl.searchParams.append('redirect_link', this._redirectUrl);
    connectUrl.searchParams.append('app_url', window.location.origin);
    connectUrl.searchParams.append('ref', 'merchant-connect');
    
    // Open Phantom app
    window.location.href = connectUrl.toString();
    
    // For mobile, we'll handle the response in the page that processes the redirect
    throw new Error('Redirecting to Phantom...');
  }

  async connect(): Promise<WalletAccount> {
    // Check if we're in a Phantom browser
    if (typeof window !== 'undefined' && window.phantom?.solana) {
      try {
        const provider = window.phantom.solana;
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
    } else {
      // Fall back to mobile deeplink
      return this.connectPhantomMobile();
    }
  }

  async disconnect(): Promise<void> {
    if (window.phantom?.solana) {
      try {
        await window.phantom.solana.disconnect();
      } catch (error) {
        console.error("Failed to disconnect from Phantom:", error);
      }
    }
    
    this._publicKey = null;
    this._dappKeyPair = null;
    this._phantomEncryptionPublicKey = null;
    this._phantomSession = null;
    this.emit("disconnect");
  }

  async sendTransaction(transaction: Transaction | VersionedTransaction): Promise<{ signature: string }> {
    if (!this._publicKey) {
      throw new Error("Wallet not connected");
    }

    // If in Phantom browser, use the provider
    if (window.phantom?.solana) {
      const { signature } = await window.phantom.solana.signAndSendTransaction(transaction);
      return { signature };
    } 
    // If on mobile, create a deeplink
    else if (this._dappKeyPair && this._phantomSession) {
      // Serialize the transaction
      const serializedTx = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      
      // Create deeplink URL for signing
      const signUrl = new URL('signAndSendTransaction', PHANTOM_DEEP_LINK_BASE);
      signUrl.searchParams.append('dapp_encryption_public_key', 
        Buffer.from(this._dappKeyPair.publicKey).toString('base64'));
      signUrl.searchParams.append('redirect_link', this._redirectUrl);
      signUrl.searchParams.append('transaction', Buffer.from(serializedTx).toString('base64'));
      signUrl.searchParams.append('session', this._phantomSession);
      
      // Open Phantom app
      window.location.href = signUrl.toString();
      
      // The actual signature will be handled by the redirect
      throw new Error('Redirecting to Phantom for signing...');
    } else {
      throw new Error("Phantom provider not available");
    }
  }

  // Process the connection callback from Phantom mobile
  processConnectCallback(encryptionPublicKey: string, nonce: string, data: string): boolean {
    if (!this._dappKeyPair) return false;
    
    try {
      // Decrypt the response
      const sharedSecret = nacl.box.before(
        Buffer.from(encryptionPublicKey, 'base64'),
        this._dappKeyPair.secretKey
      );
      
      const decryptedData = nacl.box.open.after(
        Buffer.from(data, 'base64'),
        Buffer.from(nonce, 'base64'),
        sharedSecret
      );
      
      if (!decryptedData) return false;
      
      const { public_key, session } = JSON.parse(Buffer.from(decryptedData).toString('utf8'));
      
      this._publicKey = public_key;
      this._phantomEncryptionPublicKey = encryptionPublicKey;
      this._phantomSession = session;
      
      this.emit("connect", { publicKey: this._publicKey });
      return true;
    } catch (error) {
      console.error("Error processing Phantom connection:", error);
      return false;
    }
  }

  // Process the transaction response from Phantom mobile
  processTransactionResponse(nonce: string, data: string): { signature: string } | null {
    if (!this._dappKeyPair || !this._phantomEncryptionPublicKey) return null;
    
    try {
      // Decrypt the response
      const sharedSecret = nacl.box.before(
        Buffer.from(this._phantomEncryptionPublicKey, 'base64'),
        this._dappKeyPair.secretKey
      );
      
      const decryptedData = nacl.box.open.after(
        Buffer.from(data, 'base64'),
        Buffer.from(nonce, 'base64'),
        sharedSecret
      );
      
      if (!decryptedData) return null;
      
      const { signature } = JSON.parse(Buffer.from(decryptedData).toString('utf8'));
      return { signature };
    } catch (error) {
      console.error("Error processing transaction response:", error);
      return null;
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

  // Getters for mobile integration
  get dappKeyPair(): nacl.BoxKeyPair | null {
    return this._dappKeyPair;
  }

  get phantomEncryptionPublicKey(): string | null {
    return this._phantomEncryptionPublicKey;
  }

  get phantomSession(): string | null {
    return this._phantomSession;
  }
}
