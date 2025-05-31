import { PublicKey, Transaction } from '@solana/web3.js';
import { BaseWalletAdapter } from '../BaseWalletAdapter';
import type { 
  WalletAdapter, 
  WalletConnectionResult, 
  SendOptions 
} from '../types';
import { WalletError as WalletErrorClass, WalletType as WalletTypeEnum } from '../types';

// 自定义 OKX 钱包提供者接口
interface ExtendedOKXSolanaProvider {
  connect(): Promise<string[]>;
  disconnect(): Promise<void>;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
  signMessage(message: Uint8Array | string): Promise<Uint8Array>;
}

// 添加全局类型声明
declare global {
  interface Window {
    okxwallet?: {
      solana?: ExtendedOKXSolanaProvider;
    };
  }
}

export class OKXWalletAdapter extends BaseWalletAdapter implements WalletAdapter {
  readonly name = 'OKX Wallet';
  readonly icon = 'https://static.okx.com/cdn/assets/imgs/236/C5BB243FDFE14826.png';
  readonly type = WalletTypeEnum.OKX;
  
  readonly downloadUrl = {
    android: 'https://www.okx.com/download',
    ios: 'https://www.okx.com/download',
    chrome: 'https://www.okx.com/download/okx-wallet',
  };
  
  private _provider: ExtendedOKXSolanaProvider | null = null;
  private _deeplinkHandlers: Map<string, (params: Record<string, unknown>) => void> = new Map();
  
  constructor() {
    super();
    this._setupDeeplinkHandlers();
    this._initProvider();
  }
  
  on(event: string, callback: (...args: unknown[]) => void): void {
    super.on(event, callback);
  }
  
  off(event: string, callback: (...args: unknown[]) => void): void {
    super.off(event, callback);
  }
  
  private async _initProvider(): Promise<void> {
    // 尝试获取 OKX 钱包提供者
    if (typeof window !== 'undefined' && window.okxwallet?.solana) {
      this._provider = window.okxwallet.solana as ExtendedOKXSolanaProvider;
    }
  }
  
  isInstalled(): boolean {
    return !!(typeof window !== 'undefined' && window.okxwallet?.solana);
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
      // 移动端未安装 OKX 钱包时使用 Deeplink
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
        
        return new Promise<WalletConnectionResult>((resolve, reject) => {
          const handler = (result: Record<string, unknown>) => {
            if (result.publicKey) {
              const publicKey = new PublicKey(result.publicKey as string);
              this._publicKey = publicKey;
              this._connected = true;
              this._emit('connect', publicKey);
              
              resolve({
                publicKey,
                connected: true,
                walletName: this.name,
                session: result.session as string,
              });
            } else {
              reject(new WalletErrorClass(4001, (result.error as string) || 'User rejected the request'));
            }
            this._deeplinkHandlers.delete('connect');
          };
          
          this._deeplinkHandlers.set('connect', handler);
          
          // 设置超时
          setTimeout(() => {
            this._deeplinkHandlers.delete('connect');
            reject(new WalletErrorClass(4001, 'Request timeout'));
          }, 30000); // 30秒超时
        });
      }
      
      // 确保提供者已初始化
      if (!this._provider) {
        await this._initProvider();
      }
      
      // 桌面端或已安装移动端使用 SDK
      if (!this._provider) {
        throw new WalletErrorClass(4001, 'OKX wallet not installed');
      }
      
      const accounts = await this._provider.connect();
      const publicKey = new PublicKey(accounts[0]);
      
      this._publicKey = publicKey;
      this._connected = true;
      this._emit('connect', publicKey);
      
      return {
        publicKey,
        connected: true,
        walletName: this.name,
      };
    } catch (error) {
      const err = error as Error;
      throw new WalletErrorClass(4000, err.message);
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
        const err = error as Error;
        throw new WalletErrorClass(4000, err.message);
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
      
      return new Promise<string>((resolve, reject) => {
        const handler = (result: Record<string, unknown>) => {
          if (result.signature) {
            resolve(result.signature as string);
          } else {
            reject(new WalletErrorClass(4001, (result.error as string) || 'User rejected the request'));
          }
          this._deeplinkHandlers.delete('signTransaction');
        };
        
        this._deeplinkHandlers.set('signTransaction', handler);
        
        // 设置超时
        setTimeout(() => {
          this._deeplinkHandlers.delete('signTransaction');
          reject(new WalletErrorClass(4001, 'Request timeout'));
        }, 30000); // 30秒超时
      });
    }
    
    // 确保提供者已初始化
    if (!this._provider) {
      await this._initProvider();
    }
    
    // 桌面端或已安装移动端使用 SDK
    try {
      if (!this._provider) {
        throw new WalletErrorClass(4001, 'Wallet not connected');
      }
      
      const result = await this._provider.signAndSendTransaction(transaction);
      return result.signature;
    } catch (error) {
      const err = error as Error;
      throw new WalletErrorClass(4000, err.message);
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
      
      return new Promise<Uint8Array>((resolve, reject) => {
        const handler = (result: Record<string, unknown>) => {
          if (result.signature) {
            resolve(Buffer.from(result.signature as string, 'base64'));
          } else {
            reject(new WalletErrorClass(4001, (result.error as string) || 'User rejected the request'));
          }
          this._deeplinkHandlers.delete('signMessage');
        };
        
        this._deeplinkHandlers.set('signMessage', handler);
        
        // 设置超时
        setTimeout(() => {
          this._deeplinkHandlers.delete('signMessage');
          reject(new WalletErrorClass(4001, 'Request timeout'));
        }, 30000); // 30秒超时
      });
    }
    
    // 确保提供者已初始化
    if (!this._provider) {
      await this._initProvider();
    }
    
    // 桌面端或已安装移动端使用 SDK
    try {
      if (!this._provider) {
        throw new WalletErrorClass(4001, 'Wallet not connected');
      }
      
      const signature = await this._provider.signMessage(message);
      return signature as Uint8Array;
    } catch (error) {
      const err = error as Error;
      throw new WalletErrorClass(4000, err.message);
    }
  }
  
  generateDeeplink(params: {
    action: 'connect' | 'signTransaction' | 'signMessage';
    params: Record<string, unknown>;
    returnURL: string;
  }): string {
    const { action, params: actionParams, returnURL } = params;
    const baseUrl = 'okx://wallet/dapp/url';
    const urlParams = new URLSearchParams();
    
    // 添加所有参数
    Object.entries(actionParams).forEach(([key, value]) => {
      urlParams.append(key, String(value));
    });
    
    // 添加返回 URL
    urlParams.append('redirect', returnURL);
    
    // 添加操作类型
    urlParams.append('action', action);
    
    return `${baseUrl}?${urlParams.toString()}`;
  }
  
  async handleDeeplink(url: URL): Promise<void> {
    // 处理从 Deeplink 返回的响应
    const errorParam = url.searchParams.get('error');
    
    if (errorParam) {
      this._emit('error', new WalletErrorClass(4001, errorParam));
      return;
    }
    
    // 处理连接响应
    if (url.searchParams.has('publicKey')) {
      const publicKey = url.searchParams.get('publicKey');
      const session = url.searchParams.get('session');
      const handler = this._deeplinkHandlers.get('connect');
      
      if (handler && publicKey) {
        handler({ publicKey, session });
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