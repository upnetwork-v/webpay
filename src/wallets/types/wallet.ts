import type { Transaction } from '@solana/web3.js'

export type WalletType = 'phantom' | 'okx'

export interface WalletCapabilities {
  supportsSeparateSign: boolean // 是否支持分离签名
  requiresConnect: boolean // 是否需要连接流程
  hasCallback: boolean // 是否有回调机制
  needsUserConfirmation: boolean // 是否需要用户确认
  supportsSignMessage: boolean // 是否支持 signMessage (SIWS 登录需要)
}

export interface WalletAdapter {
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  signTransaction: (transaction: Transaction) => Promise<Transaction>
  sendRawTransaction: (signedTransaction: Transaction) => Promise<string>

  // SIWS 登录：签名任意消息
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>

  // 钱包能力标识
  capabilities: WalletCapabilities

  isConnected: () => boolean
  getPublicKey: () => string | null
  handleCallback: (
    params: WalletCallbackRequest
  ) => Promise<WalletCallbackResponse>
}

export interface WalletState {
  walletType: WalletType | null
  isConnected: boolean
  publicKey: string | null
  error: string | null
  isLoading: boolean
}

export interface WalletCallbackResponse {
  type: string
  success: boolean
  data?: unknown
  error?: string
}
export interface WalletCallbackRequest {
  [key: string]: string
}

export interface WalletContextProps {
  state: WalletState
  selectWallet: (type: WalletType) => void
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  signTransaction: (transaction: Transaction) => Promise<Transaction>
  sendRawTransaction: (signedTransaction: Transaction) => Promise<string>
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  handleConnectCallback: (
    params: WalletCallbackRequest
  ) => Promise<WalletCallbackResponse>
  handlePaymentCallback: (
    params: WalletCallbackRequest
  ) => Promise<WalletCallbackResponse>
  handleSignMessageCallback: (
    params: WalletCallbackRequest
  ) => Promise<WalletCallbackResponse>

  adapter: WalletAdapter | null
  openWalletSelector: () => void
  closeWalletSelector: () => void
}

export interface WalletOption {
  type: WalletType
  name: string
  icon: React.ReactNode
}
