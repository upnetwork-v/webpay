import type { WalletType, WalletAdapter } from "@/wallets/types/wallet";
import { PhantomWalletAdapter } from "@/wallets/adapters/phantom/PhantomWalletAdapter";
// import { OkxWalletAdapter } from "@/wallets/adapters/okx/OkxWalletAdapter"; // 预留

export function createAdapter(type: WalletType): WalletAdapter {
  switch (type) {
    case "phantom":
      return new PhantomWalletAdapter();
    // case "okx":
    //   return new OkxWalletAdapter();
    default:
      throw new Error(`Unsupported wallet type: ${type}`);
  }
}
