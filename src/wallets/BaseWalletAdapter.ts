import { PublicKey } from '@solana/web3.js';
import type { WalletAdapter, WalletType } from './types';

export abstract class BaseWalletAdapter implements Partial<WalletAdapter> {
  protected _publicKey: PublicKey | null = null;
  protected _connected: boolean = false;
  protected _listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();
  
  // 基本属性
  abstract readonly name: string;
  abstract readonly icon: string;
  abstract readonly type: WalletType;
  abstract readonly downloadUrl: {
    android?: string;
    ios?: string;
    chrome?: string;
  };
  
  // 状态属性
  get connected(): boolean {
    return this._connected;
  }
  
  get publicKey(): PublicKey | null {
    return this._publicKey;
  }
  
  // 事件处理
  on(event: string, callback: (...args: unknown[]) => void): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)?.add(callback);
  }
  
  off(event: string, callback: (...args: unknown[]) => void): void {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }
  
  protected _emit(event: string, ...args: unknown[]): void {
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(...args));
    }
  }
  
  // 工具方法
  protected _isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }
}
