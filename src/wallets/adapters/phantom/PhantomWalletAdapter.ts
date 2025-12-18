/* eslint-disable @typescript-eslint/no-explicit-any */
import { sendRawTransaction } from '@/utils'
import { Transaction } from '@solana/web3.js'
import bs58 from 'bs58'
import * as nacl from 'tweetnacl'
import type {
  WalletAdapter,
  WalletCallbackRequest,
  WalletCallbackResponse,
  WalletCapabilities,
} from '../../types/wallet'
import { processConnectCallback } from '../../utils/callbacks'
import {
  buildUrl,
  openPhantomSignTransactionDeeplink,
} from '../../utils/phantom'

const DAPP_KEYPAIR_SESSION_KEY = 'phantom_dapp_keypair'
const PHANTOM_WALLET_STATE_KEY = 'phantom_wallet_state'

function saveDappKeyPairToSession(dappKeyPair: nacl.BoxKeyPair) {
  localStorage.setItem(
    DAPP_KEYPAIR_SESSION_KEY,
    JSON.stringify({
      publicKey: bs58.encode(dappKeyPair.publicKey),
      secretKey: bs58.encode(dappKeyPair.secretKey),
    })
  )
}

function loadDappKeyPairFromSession(): nacl.BoxKeyPair | null {
  const raw = localStorage.getItem(DAPP_KEYPAIR_SESSION_KEY)
  if (!raw) return null
  try {
    const { publicKey, secretKey } = JSON.parse(raw)
    return {
      publicKey: bs58.decode(publicKey),
      secretKey: bs58.decode(secretKey),
    } as nacl.BoxKeyPair
  } catch {
    return null
  }
}

function clearDappKeyPairFromSession() {
  localStorage.removeItem(DAPP_KEYPAIR_SESSION_KEY)
}

function savePhantomWalletState(state: {
  publicKey: string
  session: string
  phantomEncryptionPublicKey: string
}) {
  localStorage.setItem(PHANTOM_WALLET_STATE_KEY, JSON.stringify(state))
}

export function loadPhantomWalletState(): {
  publicKey: string
  session: string
  phantomEncryptionPublicKey: string
} | null {
  const raw = localStorage.getItem(PHANTOM_WALLET_STATE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function clearPhantomWalletState() {
  localStorage.removeItem(PHANTOM_WALLET_STATE_KEY)
}

export class PhantomWalletAdapter implements WalletAdapter {
  private _publicKey: string | null = null
  private _connected: boolean = false
  public dappKeyPair: nacl.BoxKeyPair | null
  private phantomEncryptionPublicKey: string | null = null
  private session: string | null = null

  capabilities: WalletCapabilities = {
    supportsSeparateSign: true,
    requiresConnect: true,
    hasCallback: true,
    needsUserConfirmation: false,
    supportsSignMessage: true,
  }

  constructor() {
    this.dappKeyPair = loadDappKeyPairFromSession()
    console.log(
      '[PhantomWalletAdapter 构造] dappKeyPair from localStorage',
      this.dappKeyPair
    )
    const state = loadPhantomWalletState()
    if (state) {
      this._publicKey = state.publicKey
      this.session = state.session
      this.phantomEncryptionPublicKey = state.phantomEncryptionPublicKey
      this._connected = true
    }
  }

  async connect(): Promise<void> {
    if (!this.dappKeyPair) {
      this.dappKeyPair = nacl.box.keyPair()
      saveDappKeyPairToSession(this.dappKeyPair)
      console.log('[connect] 新生成并保存 dappKeyPair', this.dappKeyPair)
    } else {
      console.log('[connect] 已存在 dappKeyPair，不重复生成', this.dappKeyPair)
    }
    // 生成重定向链接
    const redirectLink = window.location.href
    // 生成 deeplink
    const deeplink = buildUrl(
      'connect',
      new URLSearchParams({
        app_url: window.location.origin,
        dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
        redirect_link: redirectLink,
      })
    )
    // 打开 deeplink
    window.location.href = deeplink
  }

  async disconnect(): Promise<void> {
    console.log('[disconnect] 清理 dappKeyPair')
    this._publicKey = null
    this._connected = false
    this.dappKeyPair = null
    this.phantomEncryptionPublicKey = null
    this.session = null
    // 清除本地存储
    localStorage.removeItem('phantom_public_key')
    localStorage.removeItem('phantom_encryption_public_key')
    localStorage.removeItem('phantom_session')
    clearDappKeyPairFromSession()
    clearPhantomWalletState()
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    console.log('signTransaction', {
      phantomEncryptionPublicKey: this.phantomEncryptionPublicKey,
      session: this.session,
      dappKeyPair: this.dappKeyPair,
    })
    if (
      !this.phantomEncryptionPublicKey ||
      !this.session ||
      !this.dappKeyPair
    ) {
      throw new Error('Wallet not connected')
    }
    const redirectUrl = `${window.location.origin}${window.location.pathname}`
    openPhantomSignTransactionDeeplink(
      transaction,
      redirectUrl,
      this.phantomEncryptionPublicKey,
      this.dappKeyPair,
      this.session
    )

    // 对于 Phantom 钱包，signTransaction 只是打开 deeplink
    // 实际的签名结果会通过 URL 回调处理
    // 这里抛出一个特殊错误，让业务层知道需要等待回调
    throw new Error('PHANTOM_REDIRECT_PENDING')
  }

  async sendRawTransaction(signedTransaction: Transaction): Promise<string> {
    return sendRawTransaction(signedTransaction)
  }

  /**
   * 签名任意消息 (SIWS 登录需要)
   */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    // 检测是否有 injected Phantom provider (in-app browser 或 browser extension)
    const solanaProvider =
      (window as any).solana || (window as any).phantom?.solana

    console.log('[signMessage] Provider detection:', {
      hasSolana: !!(window as any).solana,
      hasPhantomSolana: !!(window as any).phantom?.solana,
      isPhantom: solanaProvider?.isPhantom,
      provider: solanaProvider,
    })

    if (solanaProvider?.isPhantom && solanaProvider?.signMessage) {
      // 使用 injected provider (更好的体验)
      console.log('[signMessage] Using injected Phantom provider')
      try {
        const { signature } = await solanaProvider.signMessage(message, 'utf8')
        return signature
      } catch (err) {
        console.error('[signMessage] Injected provider failed:', err)
        // 如果 injected provider 失败，不要 fall back 到 deeplink，直接抛出错误
        throw err
      }
    }

    // Mobile: 使用 deeplink
    if (
      !this.phantomEncryptionPublicKey ||
      !this.session ||
      !this.dappKeyPair
    ) {
      throw new Error('Wallet not connected')
    }

    // 使用与 connect 一致的 redirect URL 格式
    // connect 使用 window.location.href，所以这里也使用相同的格式
    const redirectUrl = `${window.location.origin}${window.location.pathname}`

    console.log('[signMessage] Preparing deeplink:', {
      redirectUrl,
      hasPhantomPk: !!this.phantomEncryptionPublicKey,
      hasSession: !!this.session,
      hasDappKeyPair: !!this.dappKeyPair,
    })

    // 保存待签名消息到 sessionStorage，用于回调时区分类型
    localStorage.setItem('siws_pending_message', bs58.encode(message))

    // 动态导入避免循环依赖
    const { openPhantomSignMessageDeeplink } = await import(
      '@/wallets/utils/phantom'
    )

    const deeplinkUrl = openPhantomSignMessageDeeplink(
      message,
      redirectUrl,
      this.phantomEncryptionPublicKey,
      this.dappKeyPair,
      this.session
    )

    console.log('[signMessage] Deeplink URL:', deeplinkUrl)

    throw new Error('PHANTOM_SIGN_MESSAGE_PENDING')
  }

  // 处理连接回调
  handleConnectCallback(
    phantomPk: string,
    nonce: string,
    data: string
  ): boolean {
    console.log('[handleConnectCallback] dappKeyPair', this.dappKeyPair)
    const result = processConnectCallback(
      phantomPk,
      nonce,
      data,
      this.dappKeyPair
    )
    if (result) {
      this._publicKey = result.publicKey
      this.phantomEncryptionPublicKey = phantomPk
      this.session = result.session
      this._connected = true
      savePhantomWalletState({
        publicKey: result.publicKey,
        session: result.session,
        phantomEncryptionPublicKey: phantomPk,
      })
      // 不再清理dappKeyPair，只有disconnect时清理
      return true
    }
    return false
  }

  isConnected(): boolean {
    return this._connected
  }

  getPublicKey(): string | null {
    return this._publicKey
  }

  /**
   * 统一处理 Phantom deeplink 回调
   * @param params URLSearchParams 或 Record<string, string>
   * @returns { type, success, data, error }
   */
  async handleCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    try {
      // 连接回调
      if (params.phantom_encryption_public_key && params.nonce && params.data) {
        const ok = this.handleConnectCallback(
          params.phantom_encryption_public_key,
          params.nonce,
          params.data
        )
        if (ok) {
          return {
            type: 'connect',
            success: true,
            data: { publicKey: this._publicKey } as unknown,
          }
        } else {
          return {
            type: 'connect',
            success: false,
            error: 'Failed to handle connect callback',
          }
        }
      }
      // 签名回调 (signTransaction 或 signMessage)
      else if (params.nonce && params.data) {
        if (!this.phantomEncryptionPublicKey || !this.dappKeyPair) {
          return {
            type: 'signTransaction',
            success: false,
            error: 'Wallet not connected',
          }
        }

        // 检查是否有待处理的 signMessage
        const pendingMessage = localStorage.getItem('siws_pending_message')

        if (pendingMessage) {
          // 这是 signMessage 回调
          localStorage.removeItem('siws_pending_message')

          const { decryptSignMessageResponse } = await import(
            '@/wallets/utils/phantom'
          )
          const response = decryptSignMessageResponse(
            this.phantomEncryptionPublicKey,
            params.nonce,
            params.data,
            this.dappKeyPair
          )

          return {
            type: 'signMessage',
            success: true,
            data: { signature: response.signature },
          }
        }

        // 否则是 signTransaction 回调
        const { decryptTransactionResponse } = await import(
          '@/wallets/utils/phantom'
        )
        const response = decryptTransactionResponse(
          this.phantomEncryptionPublicKey,
          params.nonce,
          params.data,
          this.dappKeyPair
        )

        return {
          type: 'signTransaction',
          success: true,
          data: { transaction: response.transaction } as unknown,
        }
      }
      // 其他情况
      return {
        type: 'unknown',
        success: false,
        error: 'Unknown callback type',
      }
    } catch (err: any) {
      return {
        type: 'error',
        success: false,
        error: err?.message || String(err),
      }
    }
  }
}
