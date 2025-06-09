import type { WalletType, WalletAdapter } from "@/wallets/types/wallet";
import { PhantomWalletAdapter } from "@/wallets/adapters/phantom/PhantomWalletAdapter";
import { OkxWalletAdapter } from "@/wallets/adapters/okx/OkxWalletAdapter";
import { TrustWalletDeepLinkAdapter } from "@/wallets/adapters/trust/TrustWalletDeepLinkAdapter";

export function createAdapter(type: WalletType): WalletAdapter {
  switch (type) {
    case "phantom":
      return new PhantomWalletAdapter();
    case "okx":
      return new OkxWalletAdapter();
    case "trust":
      return new TrustWalletDeepLinkAdapter();
    default:
      throw new Error(`Unsupported wallet type: ${type}`);
  }
}
