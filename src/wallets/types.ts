import { PublicKey, Transaction } from '@solana/web3.js';

// 钱包类型枚举
export enum WalletType {
  Phantom = 'phantom',
  OKX = 'okx',
}

// 钱包连接结果
export interface WalletConnectionResult {
  publicKey: PublicKey;
  connected: boolean;
  walletName: string;
  session?: string;
}

// 交易发送选项
export interface SendOptions {
  skipPreflight?: boolean;
  maxRetries?: number;
  commitment?: 'processed' | 'confirmed' | 'finalized';
  onProgress?: (status: 'pending' | 'confirmed' | 'finalized') => void;
}

// 钱包适配器接口
export interface WalletAdapter {
  // 基本属性
  readonly name: string;
  readonly icon: string;
  readonly type: WalletType;
  
  // 下载链接
  readonly downloadUrl: {
    android?: string;
    ios?: string;
    chrome?: string;
  };
  
  // 状态属性
  readonly connected: boolean;
  readonly publicKey: PublicKey | null;
  
  // 功能方法
  isInstalled(): boolean;
  isSupported(): boolean;
  
  // 连接方法
  connect(params?: {
    onlyIfTrusted?: boolean;
    returnURL?: string;
    appInstallURL?: string;
  }): Promise<WalletConnectionResult>;
  
  // 断开连接
  disconnect(): Promise<void>;
  
  // 交易方法
  signAndSendTransaction(
    transaction: Transaction,
    options?: SendOptions
  ): Promise<string>; // 返回交易签名
  
  // 消息签名
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  
  // 移动端 Deeplink 支持
  supportsDeeplink(): boolean;
  generateDeeplink(params: {
    action: 'connect' | 'signTransaction' | 'signMessage';
    params: Record<string, unknown>;
    returnURL: string;
  }): string;
  handleDeeplink(url: URL): Promise<void>;
  
  // 事件监听
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
}

// 钱包错误类
export class WalletError extends Error {
  code: number;
  
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = 'WalletError';
  }
}