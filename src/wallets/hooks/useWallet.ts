import { useState, useEffect, useCallback } from "react";
import { PublicKey, Transaction, type SendOptions } from "@solana/web3.js";
import type { WalletAdapter } from "../types";
import { WalletType } from "../types";
import { WalletStrategy } from "../WalletStrategy";

interface WalletState {
  adapter: WalletAdapter | null;
  connected: boolean;
  publicKey: PublicKey | null;
  connecting: boolean;
  disconnecting: boolean;
  walletType: WalletType | null;
}

interface WalletActions {
  connect: (params?: {
    onlyIfTrusted?: boolean;
    returnURL?: string;
  }) => Promise<void>;
  disconnect: () => Promise<void>;
  switchWallet: (walletType: WalletType) => Promise<void>;
  signAndSendTransaction: (
    transaction: Transaction,
    options?: SendOptions
  ) => Promise<string>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

interface UseWalletResult extends WalletState, WalletActions {
  supportedWallets: WalletAdapter[];
}

/**
 * u94b1u5305u8fdeu63a5 Hookuff0cu63d0u4f9bu94b1u5305u8fdeu63a5u72b6u6001u548cu64cdu4f5cu65b9u6cd5
 */
export function useWallet(): UseWalletResult {
  const [state, setState] = useState<WalletState>({
    adapter: null,
    connected: false,
    publicKey: null,
    connecting: false,
    disconnecting: false,
    walletType: null,
  });

  const [supportedWallets, setSupportedWallets] = useState<WalletAdapter[]>([]);

  // u521du59cbu5316u94b1u5305u7b56u7565u548cu652fu6301u7684u94b1u5305u5217u8868
  useEffect(() => {
    const strategy = WalletStrategy.getInstance();
    const wallets = strategy.getAllWallets();
    setSupportedWallets(wallets);

    // u5c1du8bd5u83b7u53d6u6700u4f73u94b1u5305u9002u914du5668
    const bestAdapter = strategy.getBestWallet();
    if (bestAdapter) {
      setState((prev) => ({
        ...prev,
        adapter: bestAdapter,
        walletType: bestAdapter.type,
      }));

      // u8bbeu7f6eu4e8bu4ef6u76d1u542cu5668
      setupEventListeners(bestAdapter);
    }

    // u6e05u7406u51fdu6570
    return () => {
      if (state.adapter) {
        removeEventListeners(state.adapter);
      }
    };
  }, [state.adapter]);

  // u8bbeu7f6eu94b1u5305u4e8bu4ef6u76d1u542cu5668
  const setupEventListeners = useCallback((adapter: WalletAdapter) => {
    // 连接事件
    const handleConnect = (...args: unknown[]) => {
      const publicKey = args[0] as PublicKey;
      setState((prev) => ({
        ...prev,
        connected: true,
        publicKey,
        connecting: false,
      }));
    };

    // 断开连接事件
    const handleDisconnect = () => {
      setState((prev) => ({
        ...prev,
        connected: false,
        publicKey: null,
        disconnecting: false,
      }));
    };

    // 错误事件
    const handleError = (...args: unknown[]) => {
      const error = args[0] as Error;
      console.error("Wallet error:", error);
      setState((prev) => ({
        ...prev,
        connecting: false,
        disconnecting: false,
      }));
    };

    // 支付签名事件（如有支付相关 UI 状态需同步，可在此扩展）
    const handleSignTransaction = () => {
      // 可根据需要扩展支付成功后的 UI 状态同步
      // 例如：setState((prev) => ({ ...prev, ... }))
      // console.log('Transaction signature received');
    };

    adapter.on("connect", handleConnect);
    adapter.on("disconnect", handleDisconnect);
    adapter.on("error", handleError);
    adapter.on("signTransaction", handleSignTransaction);
  }, []);

  // u79fbu9664u94b1u5305u4e8bu4ef6u76d1u542cu5668
  const removeEventListeners = useCallback((adapter: WalletAdapter) => {
    adapter.off("connect", () => {});
    adapter.off("disconnect", () => {});
    adapter.off("error", () => {});
  }, []);

  // u8fdeu63a5u94b1u5305
  const connect = useCallback(
    async (params?: { onlyIfTrusted?: boolean; returnURL?: string }) => {
      if (!state.adapter || state.connecting || state.connected) return;

      try {
        setState((prev) => ({ ...prev, connecting: true }));
        await state.adapter.connect(params);
      } catch (error) {
        console.error("Failed to connect wallet:", error);
        setState((prev) => ({ ...prev, connecting: false }));
        throw error;
      }
    },
    [state.adapter, state.connecting, state.connected]
  );

  // u65adu5f00u94b1u5305u8fdeu63a5
  const disconnect = useCallback(async () => {
    if (!state.adapter || state.disconnecting || !state.connected) return;

    try {
      setState((prev) => ({ ...prev, disconnecting: true }));
      await state.adapter.disconnect();
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
      setState((prev) => ({ ...prev, disconnecting: false }));
      throw error;
    }
  }, [state.adapter, state.disconnecting, state.connected]);

  // u5207u6362u94b1u5305
  const switchWallet = useCallback(
    async (walletType: WalletType) => {
      // u5982u679cu5f53u524du5df2u8fdeu63a5uff0cu5148u65adu5f00u8fdeu63a5
      if (state.connected && state.adapter) {
        await disconnect();
      }

      // u79fbu9664u65e7u9002u914du5668u7684u4e8bu4ef6u76d1u542cu5668
      if (state.adapter) {
        removeEventListeners(state.adapter);
      }

      // u83b7u53d6u65b0u7684u94b1u5305u9002u914du5668
      const strategy = WalletStrategy.getInstance();
      strategy.setPreferredWallet(walletType);
      const newAdapter = strategy.getBestWallet();

      if (newAdapter) {
        // u8bbeu7f6eu65b0u9002u914du5668u7684u4e8bu4ef6u76d1u542cu5668
        setupEventListeners(newAdapter);

        setState((prev) => ({
          ...prev,
          adapter: newAdapter,
          walletType: newAdapter.type,
          connected: false,
          publicKey: null,
        }));
      }
    },
    [
      state.adapter,
      state.connected,
      disconnect,
      removeEventListeners,
      setupEventListeners,
    ]
  );

  // u7b7eu540du5e76u53d1u9001u4ea4u6613
  const signAndSendTransaction = useCallback(
    async (transaction: Transaction, options?: SendOptions) => {
      if (!state.adapter || !state.connected) {
        throw new Error("Wallet not connected");
      }

      return await state.adapter.signAndSendTransaction(transaction, options);
    },
    [state.adapter, state.connected]
  );

  // u7b7eu540du6d88u606f
  const signMessage = useCallback(
    async (message: Uint8Array) => {
      if (!state.adapter || !state.connected) {
        throw new Error("Wallet not connected");
      }

      return await state.adapter.signMessage(message);
    },
    [state.adapter, state.connected]
  );

  // 处理 URL 参数中的钱包 deeplink 回调
  useEffect(() => {
    /**
     * 仅负责检测 Phantom deeplink 回调参数，
     * 并调用 adapter.handleDeeplink 进行解密和状态同步，
     * 成功后清理 URL 参数。
     */
    const handleDeeplinkCallback = async () => {
      if (!state.adapter) return;

      const url = new URL(window.location.href);
      console.log("url", url);
      if (url.searchParams.has("nonce") && url.searchParams.has("data")) {
        try {
          await state.adapter.handleDeeplink(url);

          // 清理 URL 参数
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        } catch (error) {
          console.error("Failed to handle deeplink callback:", error);
        }
      }
    };

    handleDeeplinkCallback();
  }, [state.adapter]);

  return {
    ...state,
    supportedWallets,
    connect,
    disconnect,
    switchWallet,
    signAndSendTransaction,
    signMessage,
  };
}
