import React, { useState, useEffect, type ReactNode, useCallback } from "react";
import type {
  WalletState,
  WalletType,
  WalletOption,
} from "@/wallets/types/wallet";
import { PhantomWalletAdapter } from "@/wallets/phantom/PhantomWalletAdapter";
import type { Transaction } from "@solana/web3.js";
import { WalletContext } from "./WalletContext";
import WalletSelector from "@/wallets/components/WalletSelector";

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

  const [adapter, setAdapter] = useState<PhantomWalletAdapter | null>(null);

  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);

  const selectWallet = (type: WalletType) => {
    localStorage.setItem("wallet_type", type);
    if (type === "phantom") {
      const newAdapter = new PhantomWalletAdapter();
      setAdapter(newAdapter);
      setState((prev) => ({
        ...prev,
        walletType: type,
      }));
      console.log("select phantom wallet");
    } else {
      // TODO: 添加其他钱包类型
    }
  };

  const connect = async () => {
    if (!adapter) {
      console.error("Wallet adapter not initialized");
      setState((prev) => ({ ...prev, error: "Wallet not selected" }));
      return;
    }
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      await adapter.connect();
      localStorage.setItem("wallet_is_connected", "true");
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
    transaction: Transaction
  ): Promise<string> => {
    if (!adapter) {
      throw new Error("Wallet adapter not initialized");
    }
    return adapter.signAndSendTransaction(transaction);
  };

  // 处理回调更新状态
  const handleConnectCallback = useCallback(
    async (params: Record<string, string>) => {
      const phantomPk = params.phantom_encryption_public_key;
      const nonce = params.nonce;
      const data = params.data;
      if (!phantomPk || !nonce || !data) {
        throw new Error("Invalid parameters");
      }
      console.log("handleConnectCallback 1", phantomPk, nonce, data);
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
    const nonce = params.nonce;
    const data = params.data;
    if (!nonce || !data) {
      throw new Error("Invalid parameters");
    }
    if (!adapter) {
      throw new Error("Wallet adapter not initialized");
    }
    return adapter.handleCallback(params);
  };

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
    if (savedType) {
      selectWallet(savedType);
      // Phantom 钱包自动恢复连接
      if (savedType === "phantom" && savedIsConnected) {
        // adapter 会在构造时自动恢复 session
        // 这里等待 adapter 初始化后自动同步 isConnected
      }
      // TODO: 其他钱包类型 autoConnect 入口
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openWalletSelector = () => setWalletSelectorOpen(true);
  const closeWalletSelector = () => setWalletSelectorOpen(false);

  // 钱包列表配置
  const walletOptions: WalletOption[] = [
    {
      type: "phantom",
      name: "Phantom",
      icon: (
        <img
          src={new URL("./phantom/logo.svg", import.meta.url).href}
          alt="Phantom"
          className="h-6 w-6"
        />
      ),
    },
    {
      type: "okx",
      name: "OKX Wallet",
      icon: (
        <img
          src={new URL("./okx/logo.png", import.meta.url).href}
          alt="OKX"
          className="h-6 w-6"
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
