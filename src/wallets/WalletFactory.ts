import type { WalletAdapter, WalletType } from "./types";
import { PhantomWalletAdapter } from "./phantom";
import { OKXWalletAdapter } from "./okx";

export class WalletFactory {
  static createWallet(name: string): WalletAdapter | null {
    switch (name.toLowerCase() as WalletType) {
      case "phantom":
        return new PhantomWalletAdapter();
      case "okx":
        return new OKXWalletAdapter();
      default:
        return null;
    }
  }

  static getAvailableWallets(): Array<{
    name: string;
    icon: string;
    adapter: WalletAdapter;
  }> {
    const wallets = [];

    if (PhantomWalletAdapter.isAvailable()) {
      wallets.push({
        name: "Phantom",
        icon: "/wallets/phantom.svg",
        adapter: new PhantomWalletAdapter(),
      });
    }

    if (OKXWalletAdapter.isAvailable()) {
      wallets.push({
        name: "OKX",
        icon: "/wallets/okx.svg",
        adapter: new OKXWalletAdapter(),
      });
    }

    return wallets;
  }
}
