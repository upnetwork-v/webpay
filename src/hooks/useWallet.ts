import { useState, useEffect, useCallback, useMemo } from 'react';
import { WalletFactory } from '@/wallets/WalletFactory';
import type { WalletAdapter, WalletAccount } from '@/wallets/types';

export const useWallet = () => {
  const [wallet, setWallet] = useState<WalletAdapter | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Get available wallets
  const availableWallets = useMemo(() => {
    return WalletFactory.getAvailableWallets();
  }, []);

  // Connect to a wallet
  const connect = useCallback(async (walletName: string) => {
    try {
      setConnecting(true);
      setError(null);
      
      const wallet = WalletFactory.createWallet(walletName);
      if (!wallet) {
        throw new Error(`Wallet ${walletName} is not supported`);
      }

      const account = await wallet.connect();
      setWallet(wallet);
      setAccount(account);
      setIsModalOpen(false);
      
      // Save to localStorage
      localStorage.setItem('connectedWallet', walletName);
      
      return account;
    } catch (err) {
      console.error('Failed to connect wallet:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    if (wallet) {
      try {
        await wallet.disconnect();
      } catch (error) {
        console.error('Failed to disconnect wallet:', error);
      } finally {
        setWallet(null);
        setAccount(null);
        localStorage.removeItem('connectedWallet');
      }
    }
  }, [wallet]);

  // Check for previously connected wallet on mount
  useEffect(() => {
    const connectedWallet = localStorage.getItem('connectedWallet');
    if (connectedWallet && !wallet && !connecting) {
      connect(connectedWallet).catch(() => {
        // If auto-connect fails, clear the stored wallet
        localStorage.removeItem('connectedWallet');
      });
    }
  }, [connect, wallet, connecting]);

  // Set up event listeners
  useEffect(() => {
    if (!wallet) return;

    const handleAccountChanged = (newAccount: WalletAccount | null) => {
      setAccount(newAccount);
      if (!newAccount) {
        // If account is null, wallet was disconnected
        setWallet(null);
        setAccount(null);
        localStorage.removeItem('connectedWallet');
      }
    };

    const handleDisconnect = () => {
      setWallet(null);
      setAccount(null);
      localStorage.removeItem('connectedWallet');
    };

    wallet.on('accountChanged', handleAccountChanged);
    wallet.on('disconnect', handleDisconnect);

    return () => {
      wallet.off('accountChanged', handleAccountChanged);
      wallet.off('disconnect', handleDisconnect);
    };
  }, [wallet]);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  return {
    wallet,
    account,
    connecting,
    error,
    isModalOpen,
    availableWallets,
    connect,
    disconnect,
    openModal,
    closeModal,
  };
};
