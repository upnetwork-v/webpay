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
    (phantomPk: string, nonce: string, data: string) => {
      console.log("handleConnectCallback 1", phantomPk, nonce, data);
      console.log("adapter", adapter);
      if (adapter && adapter.handleConnectCallback(phantomPk, nonce, data)) {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          publicKey: adapter.getPublicKey(),
          isLoading: false,
        }));

        // 清除 URL 参数
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        return true;
      }
      return false;
    },
    [adapter]
  );

  const getDappKeyPair = () => {
    if (adapter instanceof PhantomWalletAdapter) {
      return adapter.dappKeyPair;
    }
    return null;
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
      handleConnectCallback(phantomPk, nonce, data);
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
        getDappKeyPair,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
