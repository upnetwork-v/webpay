import { PublicKey, Transaction } from '@solana/web3.js';
import { BaseWalletAdapter } from '../BaseWalletAdapter';
import type { 
  WalletAdapter, 
  WalletConnectionResult, 
  SendOptions 
} from '../types';
import { WalletType, WalletError } from '../types';

// 定义 Phantom 钱包提供者接口
interface PhantomProvider {
  connect(params?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: string }>;
  disconnect(): Promise<void>;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>;
  signAndSendTransaction(transaction: Transaction, options?: SendOptions): Promise<{ signature: string }>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  isConnected: boolean;
  isPhantom: boolean;
  publicKey: PublicKey;
}

// 定义 Deeplink 结果接口
interface DeeplinkResult {
  publicKey?: string;
  signature?: string;
  session?: string;
  error?: string;
}

// 全局类型定义
declare global {
  interface Window {
    phantom?: {
      solana: PhantomProvider;
    };
  }
}

export class PhantomWalletAdapter extends BaseWalletAdapter implements WalletAdapter {
  readonly name = 'Phantom';
  readonly icon = 'https://phantom.app/favicon.ico';
  readonly type = WalletType.Phantom;
  
  readonly downloadUrl = {
    android: 'https://play.google.com/store/apps/details?id=app.phantom',
    ios: 'https://apps.apple.com/us/app/phantom-crypto-wallet/id1598432977',
    chrome: 'https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa',
  };
  
  private _provider: PhantomProvider | null = null;
  private _deeplinkHandlers: Map<string, (params: DeeplinkResult) => void> = new Map();
  private async _initProvider(): Promise<void> {
    // 尝试获取 Phantom 钱包提供者
    if (typeof window !== 'undefined' && window.phantom?.solana) {
      this._provider = window.phantom.solana;
    }
  }
  
  constructor() {
    super();
    this._setupDeeplinkHandlers();
    this._initProvider();
  }
  
  isInstalled(): boolean {
    return !!window.phantom?.solana?.isPhantom;
  }
  
  isSupported(): boolean {
    return this.isInstalled() || this._isMobile();
  }
  
  supportsDeeplink(): boolean {
    return true;
  }
  
  async connect(params?: {
    onlyIfTrusted?: boolean;
    returnURL?: string;
    appInstallURL?: string;
  }): Promise<WalletConnectionResult> {
    try {
      // 移动端未安装 Phantom 时使用 Deeplink
      if (this._isMobile() && !this.isInstalled()) {
        const deeplink = this.generateDeeplink({
          action: 'connect',
          params: {
            app: 'MerchantConnect',
            redirect: params?.returnURL || window.location.href,
          },
          returnURL: params?.returnURL || window.location.href,
        });
        
        window.location.href = deeplink;
        
        return new Promise((resolve, reject) => {
          const handler = (result: DeeplinkResult) => {
            if (result.publicKey) {
              const publicKey = new PublicKey(result.publicKey);
              this._publicKey = publicKey;
              this._connected = true;
              this._emit('connect', publicKey);
              
              resolve({
                publicKey,
                connected: true,
                walletName: this.name,
                session: result.session,
              });
            } else {
              reject(new WalletError(4001, result.error || 'User rejected the request'));
            }
            this._deeplinkHandlers.delete('connect');
          };
          
          this._deeplinkHandlers.set('connect', handler);
          
          // 设置超时
          setTimeout(() => {
            this._deeplinkHandlers.delete('connect');
            reject(new WalletError(4001, 'Request timeout'));
          }, 30000); // 30秒超时
        });
      }
      
      // 桌面端或已安装移动端使用标准流程
      if (!this._provider) {
        throw new WalletError(4001, 'Phantom wallet not installed');
      }
      
      const response = await this._provider.connect({
        onlyIfTrusted: params?.onlyIfTrusted || false,
      });
      
      const publicKey = new PublicKey(response.publicKey.toString());
      this._publicKey = publicKey;
      this._connected = true;
      this._emit('connect', publicKey);
      
      return {
        publicKey,
        connected: true,
        walletName: this.name,
      };
    } catch (error) {
      const err = error as { code?: number; message: string };
      throw new WalletError(err.code || 4000, err.message);
    }
  }
  
  async disconnect(): Promise<void> {
    if (this._provider) {
      try {
        await this._provider.disconnect();
        this._publicKey = null;
        this._connected = false;
        this._emit('disconnect');
      } catch (error) {
        const err = error as { code?: number; message: string };
        throw new WalletError(err.code || 4000, err.message);
      }
    }
  }
  
  async signAndSendTransaction(
    transaction: Transaction,
    options?: SendOptions
  ): Promise<string> {
    if (this._isMobile() && !this.isInstalled()) {
      // 移动端未安装，使用 Deeplink
      const serializedTx = transaction.serialize({ requireAllSignatures: false }).toString('base64');
      const deeplink = this.generateDeeplink({
        action: 'signTransaction',
        params: {
          transaction: serializedTx,
          display: 'touch',
          chain: 'solana:mainnet',
          ...options,
        },
        returnURL: window.location.href,
      });
      
      window.location.href = deeplink;
      
      return new Promise((resolve, reject) => {
        const handler = (result: DeeplinkResult) => {
          if (result.signature) {
            resolve(result.signature);
          } else {
            reject(new WalletError(4001, result.error || 'User rejected the request'));
          }
          this._deeplinkHandlers.delete('signTransaction');
        };
        
        this._deeplinkHandlers.set('signTransaction', handler);
        
        // 设置超时
        setTimeout(() => {
          this._deeplinkHandlers.delete('signTransaction');
          reject(new WalletError(4001, 'Request timeout'));
        }, 30000); // 30秒超时
      });
    }
    
    // 桌面端或已安装移动端使用标准流程
    try {
      if (!this._provider) {
        throw new WalletError(4001, 'Wallet not connected');
      }
      
      const { signature } = await this._provider.signAndSendTransaction(
        transaction,
        options
      );
      
      return signature;
    } catch (error) {
      const err = error as { code?: number; message: string };
      throw new WalletError(err.code || 4000, err.message);
    }
  }
  
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (this._isMobile() && !this.isInstalled()) {
      // 移动端未安装，使用 Deeplink
      const encodedMessage = Buffer.from(message).toString('base64');
      const deeplink = this.generateDeeplink({
        action: 'signMessage',
        params: {
          message: encodedMessage,
          display: 'touch',
        },
        returnURL: window.location.href,
      });
      
      window.location.href = deeplink;
      
      return new Promise((resolve, reject) => {
        const handler = (result: DeeplinkResult) => {
          if (result.signature) {
            resolve(Buffer.from(result.signature, 'base64'));
          } else {
            reject(new WalletError(4001, result.error || 'User rejected the request'));
          }
          this._deeplinkHandlers.delete('signMessage');
        };
        
        this._deeplinkHandlers.set('signMessage', handler);
        
        // 设置超时
        setTimeout(() => {
          this._deeplinkHandlers.delete('signMessage');
          reject(new WalletError(4001, 'Request timeout'));
        }, 30000); // 30秒超时
      });
    }
    
    // 桌面端或已安装移动端使用标准流程
    try {
      if (!this._provider) {
        throw new WalletError(4001, 'Wallet not connected');
      }
      
      const { signature } = await this._provider.signMessage(message);
      return signature;
    } catch (error) {
      const err = error as { code?: number; message: string };
      throw new WalletError(err.code || 4000, err.message);
    }
  }
  
  generateDeeplink(params: {
    action: 'connect' | 'signTransaction' | 'signMessage';
    params: Record<string, unknown>;
    returnURL: string;
  }): string {
    const { action, params: actionParams, returnURL } = params;
    const baseUrl = 'https://phantom.app/ul/v1';
    const urlParams = new URLSearchParams();
    
    // 添加所有参数
    Object.entries(actionParams).forEach(([key, value]) => {
      urlParams.append(key, String(value));
    });
    
    // 添加返回 URL
    urlParams.append('redirect', returnURL);
    
    return `${baseUrl}/${action}?${urlParams.toString()}`;
  }
  
  async handleDeeplink(url: URL): Promise<void> {
    // 处理从 Deeplink 返回的响应
    const errorParam = url.searchParams.get('error');
    
    if (errorParam) {
      this._emit('error', new WalletError(4001, errorParam));
      return;
    }
    
    // 处理连接响应
    if (url.searchParams.has('publicKey')) {
      const publicKey = url.searchParams.get('publicKey');
      const handler = this._deeplinkHandlers.get('connect');
      
      if (handler && publicKey) {
        handler({ publicKey });
      }
    }
    
    // 处理交易响应
    if (url.searchParams.has('signature')) {
      const signature = url.searchParams.get('signature');
      const handler = this._deeplinkHandlers.get('signTransaction');
      
      if (handler && signature) {
        handler({ signature });
      }
    }
    
    // 处理消息签名响应
    if (url.searchParams.has('signature')) {
      const signature = url.searchParams.get('signature');
      const handler = this._deeplinkHandlers.get('signMessage');
      
      if (handler && signature) {
        handler({ signature });
      }
    }
  }
  
  private _setupDeeplinkHandlers(): void {
    // 初始化时设置 Deeplink 处理器
    // 这里可以添加特定的处理逻辑
  }
}