import type { WalletAdapter } from './types';
import { WalletType } from './types';
import { PhantomWalletAdapter } from './phantom/PhantomWalletAdapter';
import { OKXWalletAdapter } from './okx/OKXWalletAdapter';

/**
 * 钱包工厂类负责创建和管理钱包适配器实例
 */
export class WalletFactory {
  private static _instance: WalletFactory;
  private _adapters: Map<WalletType, WalletAdapter>;
  
  private constructor() {
    this._adapters = new Map();
  }
  
  /**
   * 获取工厂单例
   */
  public static getInstance(): WalletFactory {
    if (!WalletFactory._instance) {
      WalletFactory._instance = new WalletFactory();
    }
    return WalletFactory._instance;
  }
  
  /**
   * 获取指定类型的钱包适配器
   * @param type 钱包类型
   * @returns 钱包适配器实例
   */
  public getAdapter(type: WalletType): WalletAdapter {
    if (!this._adapters.has(type)) {
      let adapter: WalletAdapter;
      
      switch (type) {
        case WalletType.Phantom:
          adapter = new PhantomWalletAdapter();
          break;
        case WalletType.OKX:
          adapter = new OKXWalletAdapter();
          break;
        default:
          throw new Error(`Unsupported wallet type: ${type}`);
      }
      
      this._adapters.set(type, adapter);
    }
    
    return this._adapters.get(type)!;
  }
  
  /**
   * 获取所有支持的钱包适配器
   * @returns 钱包适配器数组
   */
  public getAllAdapters(): WalletAdapter[] {
    const adapters: WalletAdapter[] = [];
    
    // 确保所有钱包类型都被初始化
    Object.values(WalletType).forEach(type => {
      try {
        adapters.push(this.getAdapter(type as WalletType));
      } catch (error) {
        console.error(`Failed to initialize wallet adapter for type ${type}:`, error);
      }
    });
    
    return adapters;
  }
  
  /**
   * 获取最适合当前环境的钱包适配器
   * @returns 最适合的钱包适配器
   */
  public getBestAdapter(): WalletAdapter | null {
    const adapters = this.getAllAdapters();
    
    // 首先检查是否有已安装的钱包
    const installedAdapters = adapters.filter(adapter => adapter.isInstalled());
    if (installedAdapters.length > 0) {
      return installedAdapters[0];
    }
    
    // 如果没有已安装的钱包，返回支持当前环境的钱包
    const supportedAdapters = adapters.filter(adapter => adapter.isSupported());
    if (supportedAdapters.length > 0) {
      return supportedAdapters[0];
    }
    
    return null;
  }
  
  /**
   * 清除所有缓存的适配器实例
   */
  public clearAdapters(): void {
    this._adapters.clear();
  }
}