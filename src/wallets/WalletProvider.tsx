import React, { useState, useEffect, type ReactNode, useCallback } from "react";
import type { WalletState, WalletType } from "@/wallets/types/wallet";
import { PhantomWalletAdapter } from "@/wallets/phantom/PhantomWalletAdapter";
import type { Transaction } from "@solana/web3.js";
import { WalletContext } from "./WalletContext";

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

  const selectWallet = (type: WalletType) => {
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

  // 1. 检测到 Phantom 回调参数时，如果 adapter 为空，自动 selectWallet("phantom")
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const phantomPk = urlParams.get("phantom_encryption_public_key");
    const nonce = urlParams.get("nonce");
    const data = urlParams.get("data");

    if (phantomPk && nonce && data && !adapter) {
      selectWallet("phantom");
    }
    // 不在这里直接调用 handleConnectCallback，等 adapter 初始化后再处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在挂载时执行

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
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
