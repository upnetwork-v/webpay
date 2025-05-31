import type { WalletAdapter } from './types';
import { WalletType } from './types';
import { WalletFactory } from './WalletFactory';

/**
 * 钱包策略类负责根据用户偏好和环境选择最合适的钱包适配器
 */
export class WalletStrategy {
  private static _instance: WalletStrategy;
  private _factory: WalletFactory;
  private _preferredWalletType: WalletType | null = null;
  
  private constructor() {
    this._factory = WalletFactory.getInstance();
    this._loadPreferredWallet();
  }
  
  /**
   * 获取策略单例
   */
  public static getInstance(): WalletStrategy {
    if (!WalletStrategy._instance) {
      WalletStrategy._instance = new WalletStrategy();
    }
    return WalletStrategy._instance;
  }
  
  /**
   * 获取最佳钱包适配器
   * 优先级：用户偏好 > 已安装钱包 > 支持当前环境的钱包
   */
  public getBestWallet(): WalletAdapter | null {
    // 如果有用户偏好的钱包类型，优先使用
    if (this._preferredWalletType) {
      try {
        const adapter = this._factory.getAdapter(this._preferredWalletType);
        if (adapter.isSupported()) {
          return adapter;
        }
      } catch (error) {
        console.warn(`Preferred wallet ${this._preferredWalletType} is not supported:`, error);
      }
    }
    
    // 否则使用工厂提供的最佳钱包
    return this._factory.getBestAdapter();
  }
  
  /**
   * 获取所有支持的钱包适配器
   */
  public getAllWallets(): WalletAdapter[] {
    return this._factory.getAllAdapters();
  }
  
  /**
   * 设置用户偏好的钱包类型
   */
  public setPreferredWallet(type: WalletType): void {
    this._preferredWalletType = type;
    this._savePreferredWallet();
  }
  
  /**
   * 获取用户偏好的钱包类型
   */
  public getPreferredWallet(): WalletType | null {
    return this._preferredWalletType;
  }
  
  /**
   * 清除用户偏好的钱包类型
   */
  public clearPreferredWallet(): void {
    this._preferredWalletType = null;
    localStorage.removeItem('preferredWalletType');
  }
  
  /**
   * 保存用户偏好的钱包类型到本地存储
   */
  private _savePreferredWallet(): void {
    if (this._preferredWalletType) {
      localStorage.setItem('preferredWalletType', this._preferredWalletType);
    }
  }
  
  /**
   * 从本地存储加载用户偏好的钱包类型
   */
  private _loadPreferredWallet(): void {
    const savedType = localStorage.getItem('preferredWalletType');
    if (savedType && Object.values(WalletType).includes(savedType as WalletType)) {
      this._preferredWalletType = savedType as WalletType;
    }
  }
}
