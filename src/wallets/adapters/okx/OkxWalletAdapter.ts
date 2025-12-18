import { sendRawTransaction } from '@/utils'
import type { WalletAdapter, WalletCapabilities } from '@/wallets/types/wallet'
import { DAPP_ICON, DAPP_NAME } from '@/wallets/utils/dapp'
import { OKXSolanaProvider } from '@okxconnect/solana-provider'
import { OKXUniversalProvider } from '@okxconnect/universal-provider'
import type { Transaction } from '@solana/web3.js'
import bs58 from 'bs58'

const OKX_SESSION_KEY = 'okx_wallet_session'
const OKX_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' // mainnet，可根据需要调整

export class OkxWalletAdapter implements WalletAdapter {
  private universalProvider: any = null
  private solanaProvider: any = null
  private session: any = null
  private publicKey: string | null = null
  private connected: boolean = false

  capabilities: WalletCapabilities = {
    supportsSeparateSign: true,
    requiresConnect: true,
    hasCallback: true,
    needsUserConfirmation: false,
    supportsSignMessage: true,
  }

  constructor() {
    // 只做 session 标记，不做异步初始化
    const sessionRaw = localStorage.getItem(OKX_SESSION_KEY)
    if (sessionRaw) {
      try {
        this.session = JSON.parse(sessionRaw)
        this.connected = true
      } catch {
        this.session = null
        this.connected = false
      }
    }
  }

  async init(): Promise<void> {
    if (!this.universalProvider) {
      this.universalProvider = await OKXUniversalProvider.init({
        dappMetaData: { name: DAPP_NAME, icon: DAPP_ICON },
      })
      this.solanaProvider = new OKXSolanaProvider(this.universalProvider)
    }
    // 恢复 publicKey
    try {
      const account = this.solanaProvider.getAccount(OKX_CHAIN_ID)
      this.publicKey = account?.address || null
      this.connected = !!this.publicKey
    } catch {
      this.publicKey = null
      this.connected = false
    }
  }

  async connect(): Promise<void> {
    if (!this.universalProvider) {
      this.universalProvider = await OKXUniversalProvider.init({
        dappMetaData: {
          name: DAPP_NAME,
          icon: DAPP_ICON,
        },
      })
    }
    // 连接钱包
    const session = await this.universalProvider.connect({
      namespaces: {
        solana: {
          chains: [OKX_CHAIN_ID],
        },
      },
      //   sessionConfig: {
      //     redirect: window.location.href,
      //   },
    })
    this.session = session
    localStorage.setItem(OKX_SESSION_KEY, JSON.stringify(session))
    this.solanaProvider = new OKXSolanaProvider(this.universalProvider)
    // 获取账户
    const account = this.solanaProvider.getAccount(OKX_CHAIN_ID)
    this.publicKey = account?.address || null
    this.connected = true
  }

  async disconnect(): Promise<void> {
    if (this.universalProvider) {
      await this.universalProvider.disconnect()
    }
    this.universalProvider = null
    this.solanaProvider = null
    this.session = null
    this.publicKey = null
    this.connected = false
    localStorage.removeItem(OKX_SESSION_KEY)
  }

  isConnected(): boolean {
    return this.connected
  }

  getPublicKey(): string | null {
    return this.publicKey
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    if (!this.solanaProvider) {
      throw new Error('Wallet not connected')
    }
    const signedTransaction = await this.solanaProvider.signTransaction(
      transaction,
      OKX_CHAIN_ID
    )
    return signedTransaction
  }

  async sendRawTransaction(signedTransaction: Transaction): Promise<string> {
    return sendRawTransaction(signedTransaction)
  }

  /**
   * 签名任意消息 (SIWS 登录需要)
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.solanaProvider) {
      throw new Error('Wallet not connected')
    }

    // OKX Solana Provider 提供 signMessage 方法
    const result = await this.solanaProvider.signMessage(message, OKX_CHAIN_ID)

    // 根据返回格式转换
    if (typeof result === 'string') {
      // 如果返回 base58 编码的字符串
      return bs58.decode(result)
    } else if (result instanceof Uint8Array) {
      return result
    } else if (result?.signature) {
      // 如果返回对象包含 signature 字段
      return typeof result.signature === 'string'
        ? bs58.decode(result.signature)
        : result.signature
    }

    throw new Error('Unexpected signMessage response format')
  }

  async handleCallback(_params: Record<string, string>) {
    // OKX 钱包一般通过 session 恢复，不需要特殊回调处理
    // 可根据需要扩展
    return {
      type: 'connect',
      success: this.connected,
      data: { publicKey: this.publicKey },
    }
  }

  getSession(): any {
    return this.session
  }
}
