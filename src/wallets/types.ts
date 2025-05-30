export interface WalletAccount {
  address: string;
  publicKey: string;
  chainId?: string;
}

export interface WalletAdapter {
  // 钱包名称
  name: string;
  // 图标 URL
  icon: string;
  // 是否已安装
  isInstalled(): boolean;
  // 连接钱包
  connect(): Promise<WalletAccount>;
  // 断开连接
  disconnect(): Promise<void>;
  // 发送交易
  sendTransaction(
    transaction: any,
    options?: any
  ): Promise<{ signature: string }>;
  // 获取账户信息
  getAccount(): Promise<WalletAccount | null>;
  // 事件监听
  on(event: string, callback: (data: any) => void): void;
  // 移除事件监听
  off(event: string, callback: (data: any) => void): void;
}

export type WalletType = 'phantom' | 'okx';
