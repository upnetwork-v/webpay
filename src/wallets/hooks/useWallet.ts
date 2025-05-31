import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { WalletAdapter } from '../types';
import { WalletType } from '../types';
import { WalletStrategy } from '../WalletStrategy';

interface WalletState {
  adapter: WalletAdapter | null;
  connected: boolean;
  publicKey: PublicKey | null;
  connecting: boolean;
  disconnecting: boolean;
  walletType: WalletType | null;
}

interface WalletActions {
  connect: (params?: { onlyIfTrusted?: boolean; returnURL?: string }) => Promise<void>;
  disconnect: () => Promise<void>;
  switchWallet: (walletType: WalletType) => Promise<void>;
  signAndSendTransaction: (transaction: any, options?: any) => Promise<string>;
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
      setState(prev => ({
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
  }, []);
  
  // u8bbeu7f6eu94b1u5305u4e8bu4ef6u76d1u542cu5668
  const setupEventListeners = useCallback((adapter: WalletAdapter) => {
    const handleConnect = (publicKey: PublicKey) => {
      setState(prev => ({
        ...prev,
        connected: true,
        publicKey,
        connecting: false,
      }));
    };
    
    const handleDisconnect = () => {
      setState(prev => ({
        ...prev,
        connected: false,
        publicKey: null,
        disconnecting: false,
      }));
    };
    
    const handleError = (error: Error) => {
      console.error('Wallet error:', error);
      setState(prev => ({
        ...prev,
        connecting: false,
        disconnecting: false,
      }));
    };
    
    adapter.on('connect', handleConnect);
    adapter.on('disconnect', handleDisconnect);
    adapter.on('error', handleError);
  }, []);
  
  // u79fbu9664u94b1u5305u4e8bu4ef6u76d1u542cu5668
  const removeEventListeners = useCallback((adapter: WalletAdapter) => {
    adapter.off('connect', () => {});
    adapter.off('disconnect', () => {});
    adapter.off('error', () => {});
  }, []);
  
  // u8fdeu63a5u94b1u5305
  const connect = useCallback(async (params?: { onlyIfTrusted?: boolean; returnURL?: string }) => {
    if (!state.adapter || state.connecting || state.connected) return;
    
    try {
      setState(prev => ({ ...prev, connecting: true }));
      await state.adapter.connect(params);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setState(prev => ({ ...prev, connecting: false }));
      throw error;
    }
  }, [state.adapter, state.connecting, state.connected]);
  
  // u65adu5f00u94b1u5305u8fdeu63a5
  const disconnect = useCallback(async () => {
    if (!state.adapter || state.disconnecting || !state.connected) return;
    
    try {
      setState(prev => ({ ...prev, disconnecting: true }));
      await state.adapter.disconnect();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
      setState(prev => ({ ...prev, disconnecting: false }));
      throw error;
    }
  }, [state.adapter, state.disconnecting, state.connected]);
  
  // u5207u6362u94b1u5305
  const switchWallet = useCallback(async (walletType: WalletType) => {
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
      
      setState(prev => ({
        ...prev,
        adapter: newAdapter,
        walletType: newAdapter.type,
        connected: false,
        publicKey: null,
      }));
    }
  }, [state.adapter, state.connected, disconnect, removeEventListeners, setupEventListeners]);
  
  // u7b7eu540du5e76u53d1u9001u4ea4u6613
  const signAndSendTransaction = useCallback(async (transaction: any, options?: any) => {
    if (!state.adapter || !state.connected) {
      throw new Error('Wallet not connected');
    }
    
    return await state.adapter.signAndSendTransaction(transaction, options);
  }, [state.adapter, state.connected]);
  
  // u7b7eu540du6d88u606f
  const signMessage = useCallback(async (message: Uint8Array) => {
    if (!state.adapter || !state.connected) {
      throw new Error('Wallet not connected');
    }
    
    return await state.adapter.signMessage(message);
  }, [state.adapter, state.connected]);
  
  // u5904u7406 URL u53c2u6570u4e2du7684u94b1u5305u56deu8c03
  useEffect(() => {
    const handleDeeplinkCallback = async () => {
      if (!state.adapter) return;
      
      const url = new URL(window.location.href);
      if (url.searchParams.has('publicKey') || url.searchParams.has('signature') || url.searchParams.has('error')) {
        try {
          await state.adapter.handleDeeplink(url);
          
          // u6e05u9664 URL u53c2u6570
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.error('Failed to handle deeplink callback:', error);
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
