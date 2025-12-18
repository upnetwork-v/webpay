import { OkxWalletAdapter } from '@/wallets/adapters/okx/OkxWalletAdapter'
import { PhantomWalletAdapter } from '@/wallets/adapters/phantom/PhantomWalletAdapter'
import type { WalletAdapter, WalletType } from '@/wallets/types/wallet'

export function createAdapter(type: WalletType): WalletAdapter {
  switch (type) {
    case 'phantom':
      return new PhantomWalletAdapter()
    case 'okx':
      return new OkxWalletAdapter()
    default:
      throw new Error(`Unsupported wallet type: ${type}`)
  }
}
