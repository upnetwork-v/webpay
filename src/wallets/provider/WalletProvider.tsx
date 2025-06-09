import React, { useState, useEffect, type ReactNode, useCallback } from "react";
import type {
  WalletState,
  WalletType,
  WalletOption,
  WalletAdapter,
  PaymentRequest,
} from "../types/wallet";
import { createAdapter } from "../adapters/adapterFactory";
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
      if (typeof (newAdapter as any).init === "function") {
        await (newAdapter as any).init();
      }
      setAdapter(newAdapter);

      // 对于 Trust Wallet，先从 localStorage 恢复状态
      // 真实的连接状态会在 tryReconnect 后更新
      if (type === "trust") {
        const savedIsConnected =
          localStorage.getItem("wallet_is_connected") === "true";
        console.log(
          "[WalletProvider] Restoring Trust Wallet state from localStorage:",
          { savedIsConnected }
        );

        // 让 adapter 先恢复状态，然后获取 publicKey
        const currentPublicKey = newAdapter.getPublicKey();
        console.log(
          "[WalletProvider] Trust Wallet publicKey from adapter:",
          currentPublicKey
        );

        setState((prev) => ({
          ...prev,
          walletType: type,
          // 暂时使用保存的状态，真实状态会在重连后更新
          isConnected: savedIsConnected,
          publicKey: currentPublicKey, // 从 adapter 获取已恢复的 publicKey
          error: null,
        }));
      } else {
        // 其他钱包正常处理
        setState((prev) => ({
          ...prev,
          walletType: type,
          publicKey: newAdapter.getPublicKey(),
          isConnected: newAdapter.isConnected(),
          error: null,
        }));
      }
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
      // 如果 walletType 是 trust，则关闭 wallet selector 的 modal
      if (state.walletType === "trust") {
        setWalletSelectorOpen(false);
      }
      await adapter.connect();
      localStorage.setItem("wallet_is_connected", "true");
      // 如果 walletType 是 okx 或 trust，则设置为已连接状态
      if (state.walletType === "okx" || state.walletType === "trust") {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          publicKey: adapter.getPublicKey(),
          isLoading: false,
        }));

        setWalletSelectorOpen(false);
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
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Disconnection failed";
        setState((prev) => ({ ...prev, error: errorMessage }));
      }
    }
  };

  const signAndSendTransaction = async (
    request: PaymentRequest
  ): Promise<string> => {
    if (!adapter) {
      throw new Error("Wallet adapter not initialized");
    }
    return adapter.signAndSendTransaction(request);
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

  const handlePaymentCallback = async (params: Record<string, string>) => {
    if (!adapter) {
      throw new Error("Wallet adapter not initialized");
    }
    return adapter.handleCallback(params);
  };

  // 2. adapter 初始化后，如果 URL 有钱包回调参数，则执行 handleConnectCallback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);

    // Phantom 回调参数
    const phantomPk = urlParams.get("phantom_encryption_public_key");
    const nonce = urlParams.get("nonce");
    const data = urlParams.get("data");

    // Trust Wallet 回调参数
    const trustAddress = urlParams.get("trust_address");
    const trustSignature = urlParams.get("trust_signature");
    const trustType = urlParams.get("trust_type");

    if (adapter && phantomPk && nonce && data) {
      handleConnectCallback({
        phantom_encryption_public_key: phantomPk,
        nonce: nonce,
        data: data,
      });
    } else if (adapter && trustAddress && trustType) {
      handleConnectCallback({
        type: trustType,
        address: trustAddress,
        signature: trustSignature || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  // 3. adapter 初始化后自动同步连接状态到 state
  useEffect(() => {
    console.log("[WalletProvider] Checking adapter connection state:", {
      hasAdapter: !!adapter,
      adapterType: state.walletType,
      isConnected: adapter?.isConnected(),
      publicKey: adapter?.getPublicKey(),
    });

    if (adapter && adapter.isConnected()) {
      console.log("[WalletProvider] Syncing connected state to context");
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
    if (savedType) {
      (async () => {
        await selectWallet(savedType);
        // Phantom 钱包自动恢复连接
        if (savedType === "phantom" && savedIsConnected) {
          // adapter 会在构造时自动恢复 session
          // 这里等待 adapter 初始化后自动同步 isConnected
        }

        // Trust Wallet 恢复连接逻辑移动到单独的 useEffect 中处理
        // 因为这里的 adapter 作用域问题导致无法正确访问

        // TODO: 其他钱包类型 autoConnect 入口
      })();
    }
  }, []);

  // Trust Wallet 自动恢复连接逻辑
  useEffect(() => {
    const savedType = localStorage.getItem("wallet_type") as WalletType | null;
    const savedIsConnected =
      localStorage.getItem("wallet_is_connected") === "true";

    console.log(
      "[WalletProvider] Trust Wallet reconnection conditions check:",
      {
        savedType,
        savedIsConnected,
        hasAdapter: !!adapter,
        adapterType: adapter ? (adapter as any).constructor.name : null,
      }
    );

    if (savedType === "trust" && savedIsConnected && adapter) {
      // Trust Wallet 使用 WalletConnect 会话恢复机制
      const trustAdapter = adapter as any;
      console.log("[WalletProvider] Trust Wallet adapter check:", {
        hasTrustAdapter: !!trustAdapter,
        hasTryReconnectMethod: typeof trustAdapter.tryReconnect === "function",
        methodType: typeof trustAdapter.tryReconnect,
      });

      if (trustAdapter && typeof trustAdapter.tryReconnect === "function") {
        (async () => {
          try {
            console.log(
              "[WalletProvider] Attempting Trust Wallet reconnection..."
            );
            await trustAdapter.tryReconnect();
            // 重连成功后，立即同步状态
            if (trustAdapter.isConnected()) {
              setState((prev) => ({
                ...prev,
                isConnected: true,
                publicKey: trustAdapter.getPublicKey(),
                isLoading: false,
                error: null,
              }));
              console.log(
                "[WalletProvider] Trust Wallet reconnected successfully"
              );
            }
          } catch (error) {
            console.warn(
              "[WalletProvider] Trust Wallet reconnection failed:",
              error
            );
            // 重连失败，清理连接状态
            localStorage.removeItem("wallet_is_connected");
            setState((prev) => ({
              ...prev,
              isConnected: false,
              publicKey: null,
              error: "Session expired, please reconnect",
            }));
          }
        })();
      } else {
        console.warn(
          "[WalletProvider] Trust Wallet adapter does not have tryReconnect method or is invalid"
        );
      }
    } else {
      console.log(
        "[WalletProvider] Trust Wallet reconnection conditions not met:",
        {
          isTrustWallet: savedType === "trust",
          wasPreviouslyConnected: savedIsConnected,
          hasAdapter: !!adapter,
        }
      );
    }
  }, [adapter]); // 依赖 adapter，确保 adapter 初始化后再执行

  const openWalletSelector = () => setWalletSelectorOpen(true);
  const closeWalletSelector = () => setWalletSelectorOpen(false);

  // 调试方法：手动刷新 Trust Wallet 账户
  const refreshTrustWalletAccounts = async () => {
    if (state.walletType === "trust" && adapter) {
      const trustAdapter = adapter as any;
      if (typeof trustAdapter.refreshAccounts === "function") {
        try {
          await trustAdapter.refreshAccounts();
          // 刷新后更新状态
          setState((prev) => ({
            ...prev,
            publicKey: trustAdapter.getPublicKey(),
            isConnected: trustAdapter.isConnected(),
            error: null,
          }));
          console.log(
            "[WalletProvider] Trust Wallet accounts refreshed successfully"
          );
        } catch (error) {
          console.error(
            "[WalletProvider] Failed to refresh Trust Wallet accounts:",
            error
          );
          setState((prev) => ({
            ...prev,
            error:
              error instanceof Error
                ? error.message
                : "Failed to refresh accounts",
          }));
        }
      }
    }
  };

  // 开发环境下将方法暴露到 window 对象，方便调试
  useEffect(() => {
    if (typeof window !== "undefined" && import.meta.env.DEV) {
      (window as any).refreshTrustWalletAccounts = refreshTrustWalletAccounts;
      console.log(
        "[WalletProvider] Debug method 'refreshTrustWalletAccounts' available on window object"
      );
    }
  }, [state.walletType, adapter]);

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
          src={new URL("../adapters/trust/logo.svg", import.meta.url).href}
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
        signAndSendTransaction,
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
