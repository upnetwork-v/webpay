/**
 * Trust Wallet 集成相关类型定义
 */

export interface TrustWalletState {
  isConnected: boolean;
  isInstalled: boolean;
  isConnecting: boolean;
  address?: string;
  balance?: number;
  error?: string;
}

export interface PaymentParams {
  /** 收款地址 */
  address: string;
  /** 支付金额 (可选) */
  amount?: number;
  /** 备注信息 (可选) */
  memo?: string;
  /** 额外数据 (可选) */
  data?: string;
  /** 资产类型 (默认 SOL) */
  asset?: string;
}

export interface DeepLinkParams {
  /** 收款地址 */
  address: string;
  /** 支付金额 */
  amount?: number;
  /** 备注信息 */
  memo?: string;
  /** 资产标识符 (UAI 格式) */
  asset?: string;
}

export interface WalletConnectParams {
  /** WalletConnect URI */
  uri: string;
  /** 连接超时时间 */
  timeout?: number;
}

export interface BrowserInfo {
  /** 是否为移动端 */
  isMobile: boolean;
  /** 是否为 iOS */
  isIOS: boolean;
  /** 是否为 Android */
  isAndroid: boolean;
  /** 浏览器名称 */
  browser: string;
  /** 用户代理字符串 */
  userAgent: string;
}

export interface TrustWalletDetectionResult {
  /** Trust Wallet 是否已安装 */
  isInstalled: boolean;
  /** 是否支持 Deep Link */
  supportsDeepLink: boolean;
  /** 是否支持 WalletConnect */
  supportsWalletConnect: boolean;
  /** 检测到的钱包版本 */
  version?: string;
  /** 浏览器信息 */
  browserInfo: BrowserInfo;
}

export interface TrustWalletConnectionOptions {
  /** 连接策略 */
  strategy: "deeplink" | "walletconnect" | "auto";
  /** 超时时间 */
  timeout?: number;
  /** 是否显示安装引导 */
  showInstallGuide?: boolean;
}

export type TrustWalletConnectionStrategy = "deeplink" | "auto";

export type TrustWalletError =
  | "NOT_INSTALLED"
  | "CONNECTION_FAILED"
  | "TRANSACTION_FAILED"
  | "USER_REJECTED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";
