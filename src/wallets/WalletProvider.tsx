import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { WalletState, WalletType } from "@/wallets/types/wallet";
import { PhantomWalletAdapter } from "@/wallets/phantom/PhantomWalletAdapter";
import type { Transaction } from "@solana/web3.js";

interface WalletContextProps {
  state: WalletState;
  selectWallet: (type: WalletType) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (transaction: Transaction) => Promise<string>;
  handleConnectCallback: (
    phantomPk: string,
    nonce: string,
    data: string
  ) => boolean;
  getDappKeyPair: () => nacl.BoxKeyPair | null;
}

const WalletContext = createContext<WalletContextProps | null>(null);

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
      setState((prev) => ({ ...prev, walletType: type }));
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
  const handleConnectCallback = (
    phantomPk: string,
    nonce: string,
    data: string
  ) => {
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
  };

  const getDappKeyPair = () => {
    if (adapter instanceof PhantomWalletAdapter) {
      return adapter.dappKeyPair;
    }
    return null;
  };

  useEffect(() => {
    const handleUrlCallback = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const phantomPk = urlParams.get("phantom_encryption_public_key");
      const nonce = urlParams.get("nonce");
      const data = urlParams.get("data");

      if (phantomPk && nonce && data) {
        handleConnectCallback(phantomPk, nonce, data);
      }
    };

    // 初始检查
    handleUrlCallback();

    // 监听 URL 变化
    window.addEventListener("popstate", handleUrlCallback);

    return () => {
      window.removeEventListener("popstate", handleUrlCallback);
    };
  }, [handleConnectCallback]);

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

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};
