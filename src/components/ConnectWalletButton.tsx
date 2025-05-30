import React from 'react';
import { useWallet } from '@/hooks/useWallet';
import { WalletSelector } from './WalletSelector';

export const ConnectWalletButton: React.FC = () => {
  const {
    account,
    connecting,
    isModalOpen,
    openModal,
    closeModal,
    disconnect,
    connect,
  } = useWallet();

  const handleSelectWallet = async (walletName: string) => {
    try {
      await connect(walletName);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  if (account) {
    return (
      <div className="flex items-center space-x-2">
        <span className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md">
          {`${account.address.slice(0, 4)}...${account.address.slice(-4)}`}
        </span>
        <button
          onClick={disconnect}
          disabled={connecting}
          className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={openModal}
        disabled={connecting}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>

      <WalletSelector
        isOpen={isModalOpen}
        onClose={closeModal}
        onSelect={handleSelectWallet}
      />
    </>
  );
};
