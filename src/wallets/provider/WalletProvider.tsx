import React, { useState, useEffect, type ReactNode, useCallback } from "react";
import type {
  WalletState,
  WalletType,
  WalletOption,
  WalletAdapter,
} from "../types/wallet";
import { createAdapter } from "../adapters/adapterFactory";
import type { Transaction } from "@/types";
import { WalletContext } from "./WalletContext";
import WalletSelector from "../components/WalletSelector";

export const WalletProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<WalletState>({
    walletType: null,
    isConnected: false,
    publicKey: null,
    error: null,
    isLoading: false,
  });

  const [adapter, setAdapter] = useState<WalletAdapter | null>(null);

  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);

  const selectWallet = async (type: WalletType) => {
    localStorage.setItem("wallet_type", type);
    try {
      const newAdapter = createAdapter(type);
      // 类型守卫函数
      const hasInitMethod = (adapter: WalletAdapter): adapter is WalletAdapter & { init: () => Promise<void> } => {
        return 'init' in adapter && typeof (adapter as any).init === 'function';
      };

      const isTrustWalletAdapter = (adapter: WalletAdapter): adapter is WalletAdapter & {
        validateSession: () => Promise<boolean>;
        clearInvalidSession: () => void;
      } => {
        return type === "trust" &&
          'validateSession' in adapter &&
          'clearInvalidSession' in adapter &&
          typeof (adapter as any).validateSession === 'function' &&
          typeof (adapter as any).clearInvalidSession === 'function';
      };

      if (hasInitMethod(newAdapter)) {
        await newAdapter.init();
      }

      // 对于 Trust Wallet，验证会话状态
      if (isTrustWalletAdapter(newAdapter)) {
        const isValid = await newAdapter.validateSession();
        if (!isValid) {
          console.log("[WalletProvider] Trust Wallet session invalid, clearing state");
          newAdapter.clearInvalidSession();
          // 重置为未连接状态
          setState((prev) => ({
            ...prev,
            walletType: type,
            isConnected: false,
            publicKey: null,
            error: null,
          }));
          setAdapter(newAdapter);
          return;
        }
      }

      setAdapter(newAdapter);
      setState((prev) => ({
        ...prev,
        walletType: type,
        publicKey: newAdapter.getPublicKey(),
        isConnected: newAdapter.isConnected(),
        error: null,
      }));
    } catch (e) {
      setAdapter(null);
      setState((prev) => ({ ...prev, error: (e as Error).message }));
    }
  };

  const connect = async () => {
    if (!adapter) {
      setState((prev) => ({ ...prev, error: "Wallet not selected" }));
      return;
    }
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await adapter.connect();

      // 检查连接是否立即成功（对于不需要重定向的钱包）
      if (adapter.isConnected()) {
        localStorage.setItem("wallet_is_connected", "true");
        setState((prev) => ({
          ...prev,
          isConnected: true,
          publicKey: adapter.getPublicKey(),
          isLoading: false,
        }));
        setWalletSelectorOpen(false);
      } else {
        // 对于需要重定向的钱包（如 Trust Wallet），保持加载状态
        // 连接状态将在用户返回后通过会话恢复机制更新
        console.log("[WalletProvider] Wallet connection initiated, waiting for user to return from wallet app");

        // 对于 Trust Wallet，设置一个定时器来检查连接状态
        if (state.walletType === "trust") {
          const checkInterval = setInterval(() => {
            if (adapter && adapter.isConnected()) {
              localStorage.setItem("wallet_is_connected", "true");
              setState((prev) => ({
                ...prev,
                isConnected: true,
                publicKey: adapter.getPublicKey(),
                isLoading: false,
              }));
              setWalletSelectorOpen(false);
              clearInterval(checkInterval);
            }
          }, 2000); // 每2秒检查一次

          // 设置超时，避免无限等待
          setTimeout(() => {
            clearInterval(checkInterval);
            if (!adapter?.isConnected()) {
              setState((prev) => ({
                ...prev,
                error: "Connection timeout. Please try again.",
                isLoading: false,
              }));
            }
          }, 120000); // 2分钟超时
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Connection failed";
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
      }));
    }
  };

  const disconnect = async () => {
    if (adapter) {
      try {
        await adapter.disconnect();
        setState({
          walletType: null,
          isConnected: false,
          publicKey: null,
          error: null,
          isLoading: false,
        });
        localStorage.removeItem("wallet_type");
        localStorage.removeItem("wallet_is_connected");
        localStorage.removeItem("wallet_provider_initialized"); // 清理初始化标志
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Disconnection failed";
        setState((prev) => ({ ...prev, error: errorMessage }));
      }
    }
  };

  const signTransaction = async (
    transaction: Transaction
  ): Promise<Transaction> => {
    if (!adapter) {
      throw new Error("Wallet adapter not initialized");
    }
    return adapter.signTransaction(transaction);
  };

  const sendRawTransaction = async (
    signedTransaction: Transaction
  ): Promise<string> => {
    if (!adapter) {
      throw new Error("Wallet adapter not initialized");
    }
    return adapter.sendRawTransaction(signedTransaction);
  };

  // 处理回调更新状态
  const handleConnectCallback = useCallback(
    async (params: Record<string, string>) => {
      if (!adapter) {
        throw new Error("Wallet adapter not initialized");
      }
      const result = await adapter.handleCallback(params);
      if (result.success && result.type === "connect") {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          publicKey: adapter.getPublicKey(),
          isLoading: false,
        }));
      }
      return result;
    },
    [adapter]
  );

  const handlePaymentCallback = useCallback(
    async (params: Record<string, string>) => {
      if (!adapter) {
        throw new Error("Wallet adapter not initialized");
      }
      return adapter.handleCallback(params);
    },
    [adapter]
  );

  // 2. adapter 初始化后，如果 URL 有 Phantom 回调参数，则执行 handleConnectCallback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const phantomPk = urlParams.get("phantom_encryption_public_key");
    const nonce = urlParams.get("nonce");
    const data = urlParams.get("data");

    if (adapter && phantomPk && nonce && data) {
      handleConnectCallback({
        phantom_encryption_public_key: phantomPk,
        nonce: nonce,
        data: data,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  // 3. adapter 初始化后自动同步连接状态到 state
  useEffect(() => {
    if (adapter && adapter.isConnected()) {
      setState((prev) => ({
        ...prev,
        isConnected: true,
        publicKey: adapter.getPublicKey(),
        isLoading: false,
        error: null,
      }));
    }
  }, [adapter]);

  // 1. 页面加载时自动恢复 walletType 和连接状态
  useEffect(() => {
    const savedType = localStorage.getItem("wallet_type") as WalletType | null;
    const savedIsConnected =
      localStorage.getItem("wallet_is_connected") === "true";

    // 防止重复初始化
    const hasInitialized = localStorage.getItem("wallet_provider_initialized") === "true";

    if (savedType && !hasInitialized) {
      localStorage.setItem("wallet_provider_initialized", "true");

      (async () => {
        try {
          await selectWallet(savedType);

          // Phantom 钱包自动恢复连接
          if (savedType === "phantom" && savedIsConnected) {
            // adapter 会在构造时自动恢复 session
            // 这里等待 adapter 初始化后自动同步 isConnected
          }

          // Trust Wallet 自动恢复连接
          if (savedType === "trust") {
            const isConnecting = localStorage.getItem("trust_wallet_connecting") === "true";
            if (isConnecting || savedIsConnected) {
              console.log("[WalletProvider] Trust Wallet auto-recovery initiated");
              // 等待一段时间让 TrustWalletAdapter 完成初始化
              setTimeout(() => {
                if (adapter && adapter.isConnected()) {
                  setState((prev) => ({
                    ...prev,
                    isConnected: true,
                    publicKey: adapter.getPublicKey(),
                    isLoading: false,
                  }));
                }
              }, 2000);
            }
          }
        } catch (error) {
          console.error("[WalletProvider] Auto-recovery failed:", error);
          // 重置初始化标志，允许重试
          localStorage.removeItem("wallet_provider_initialized");
        }
      })();
    }
  }, [adapter]);

  const openWalletSelector = () => setWalletSelectorOpen(true);
  const closeWalletSelector = () => setWalletSelectorOpen(false);

  // 钱包列表配置
  const walletOptions: WalletOption[] = [
    {
      type: "phantom",
      name: "Phantom",
      icon: (
        <img
          src={new URL("../adapters/phantom/logo.svg", import.meta.url).href}
          alt="Phantom"
          className="rounded-full object-cover h-10 w-10"
        />
      ),
    },
    {
      type: "okx",
      name: "OKX Wallet",
      icon: (
        <img
          src={new URL("../adapters/okx/logo.png", import.meta.url).href}
          alt="OKX"
          className="rounded-full object-cover h-10 w-10"
        />
      ),
    },
    {
      type: "trust",
      name: "Trust Wallet",
      icon: (
        <img
          src={new URL("../adapters/trust/logo.png", import.meta.url).href}
          alt="Trust Wallet"
          className="rounded-full object-cover h-10 w-10"
        />
      ),
    },
  ];

  return (
    <WalletContext.Provider
      value={{
        state,
        selectWallet,
        connect,
        disconnect,
        signTransaction,
        sendRawTransaction,
        handleConnectCallback,
        handlePaymentCallback,
        adapter,
        openWalletSelector,
        closeWalletSelector,
      }}
    >
      {children}
      <WalletSelector
        open={walletSelectorOpen}
        onClose={closeWalletSelector}
        wallets={walletOptions}
        selectedWalletType={state.walletType}
        isConnected={state.isConnected}
        isLoading={state.isLoading}
        error={state.error}
        onSelectWallet={selectWallet}
        onConnect={connect}
        onDisconnect={disconnect}
      />
    </WalletContext.Provider>
  );
};
