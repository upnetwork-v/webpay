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
        return 'init' in adapter && typeof (adapter as WalletAdapter & { init?: unknown }).init === 'function';
      };

      const isTrustWalletAdapter = (adapter: WalletAdapter): adapter is WalletAdapter & {
        validateSession: () => Promise<boolean>;
        clearInvalidSession: () => void;
      } => {
        return type === "trust" &&
          'validateSession' in adapter &&
          'clearInvalidSession' in adapter &&
          typeof (adapter as WalletAdapter & { validateSession?: unknown }).validateSession === 'function' &&
          typeof (adapter as WalletAdapter & { clearInvalidSession?: unknown }).clearInvalidSession === 'function';
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
    console.log("[WalletProvider] Callback processing effect triggered, adapter exists:", !!adapter);

    const urlParams = new URLSearchParams(window.location.search);
    const phantomPk = urlParams.get("phantom_encryption_public_key");
    const nonce = urlParams.get("nonce");
    const data = urlParams.get("data");

    console.log("[WalletProvider] URL parameters check:", {
      hasAdapter: !!adapter,
      hasPhantomPk: !!phantomPk,
      hasNonce: !!nonce,
      hasData: !!data,
      phantomPk: phantomPk ? phantomPk.substring(0, 10) + "..." : null,
    });

    if (adapter && phantomPk && nonce && data) {
      console.log("[WalletProvider] All conditions met, processing Phantom callback...");
      handleConnectCallback({
        phantom_encryption_public_key: phantomPk,
        nonce: nonce,
        data: data,
      })
        .then((result) => {
          console.log("[WalletProvider] Callback processing result:", result);
          if (result.success) {
            console.log("[WalletProvider] Phantom callback processed successfully");
            // 清理URL参数
            const newUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, document.title, newUrl);
            // 标记连接成功
            localStorage.setItem("wallet_is_connected", "true");
            console.log("[WalletProvider] Connection marked as successful");
          } else {
            console.error("[WalletProvider] Phantom callback failed:", result.error);
            setState((prev) => ({
              ...prev,
              error: result.error || "Connection failed",
              isLoading: false,
            }));
          }
        })
        .catch((error) => {
          console.error("[WalletProvider] Error processing Phantom callback:", error);
          setState((prev) => ({
            ...prev,
            error: error.message || "Connection failed",
            isLoading: false,
          }));
        });
    } else {
      console.log("[WalletProvider] Callback processing skipped - conditions not met");
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
    console.log("[WalletProvider] Initialization effect triggered");

    // 检查URL是否包含Phantom回调参数
    const urlParams = new URLSearchParams(window.location.search);
    const hasPhantomCallback = urlParams.has("phantom_encryption_public_key") &&
      urlParams.has("nonce") &&
      urlParams.has("data");

    console.log("[WalletProvider] Callback detection:", {
      hasPhantomCallback,
      currentAdapter: !!adapter,
      url: window.location.href,
    });

    let savedType = localStorage.getItem("wallet_type") as WalletType | null;
    const savedIsConnected =
      localStorage.getItem("wallet_is_connected") === "true";

    // 如果URL包含Phantom回调参数但没有保存的wallet_type，设置为phantom
    if (hasPhantomCallback && !savedType) {
      console.log("[WalletProvider] Detected Phantom callback without saved wallet type, setting to phantom");
      savedType = "phantom";
      localStorage.setItem("wallet_type", "phantom");
    }

    // 如果检测到回调参数且adapter不存在，强制初始化
    if (hasPhantomCallback && !adapter) {
      console.log("[WalletProvider] Phantom callback detected without adapter, forcing initialization");
      // 直接初始化，不等待标志检查
      (async () => {
        try {
          console.log("[WalletProvider] Creating Phantom adapter for callback processing");
          await selectWallet("phantom");
          console.log("[WalletProvider] Adapter created successfully");
        } catch (error) {
          console.error("[WalletProvider] Failed to create adapter:", error);
        }
      })();
      return; // 等待adapter创建后，回调处理的useEffect会自动触发
    }

    // 正常的初始化流程（无回调时）
    const hasInitialized = localStorage.getItem("wallet_provider_initialized") === "true";

    if (savedType && !hasInitialized && !adapter) {
      console.log("[WalletProvider] Normal initialization for wallet type:", savedType);
      localStorage.setItem("wallet_provider_initialized", "true");

      (async () => {
        try {
          await selectWallet(savedType);
          console.log("[WalletProvider] Wallet adapter initialized successfully");

          // Phantom 钱包自动恢复连接
          if (savedType === "phantom" && savedIsConnected) {
            console.log("[WalletProvider] Phantom wallet session will be restored");
          }

          // Trust Wallet 自动恢复连接
          if (savedType === "trust") {
            const isConnecting = localStorage.getItem("trust_wallet_connecting") === "true";
            if (isConnecting || savedIsConnected) {
              console.log("[WalletProvider] Trust Wallet auto-recovery initiated");
              setTimeout(() => {
                // Note: adapter状态会通过另一个useEffect同步，这里的检查是为了确保
                console.log("[WalletProvider] Trust Wallet recovery check timeout reached");
              }, 2000);
            }
          }
        } catch (error) {
          console.error("[WalletProvider] Auto-recovery failed:", error);
          localStorage.removeItem("wallet_provider_initialized");
        }
      })();
    } else {
      console.log("[WalletProvider] Initialization skipped:", {
        savedType,
        hasInitialized,
        hasAdapter: !!adapter,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

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
