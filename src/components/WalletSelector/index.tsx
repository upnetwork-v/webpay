import React, { useState, useEffect } from "react";
import { Dialog } from "@headlessui/react";
import { WalletButton } from "./WalletButton";
import { WalletFactory } from "@/wallets/WalletFactory";

export const WalletSelector: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelect: (walletName: string) => void;
}> = ({ isOpen, onClose, onSelect }) => {
  const [wallets, setWallets] = useState<
    Array<{
      name: string;
      icon: string;
      adapter: any;
    }>
  >([]);

  useEffect(() => {
    // Get available wallets when component mounts
    const availableWallets = WalletFactory.getAvailableWallets();
    setWallets(availableWallets);
  }, []);

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="flex items-center justify-center min-h-screen">
        <div className="relative z-10 w-full max-w-md p-6 mx-auto bg-white rounded-lg shadow-xl">
          <Dialog.Title className="text-lg font-medium text-gray-900">
            Connect Wallet
          </Dialog.Title>
          <p className="mt-2 text-sm text-gray-500">
            Choose a wallet to connect to your account
          </p>

          <div className="mt-6 space-y-3">
            {wallets.length > 0 ? (
              wallets.map((wallet) => (
                <WalletButton
                  key={wallet.name}
                  name={wallet.name}
                  icon={wallet.icon}
                  onClick={() => onSelect(wallet.name)}
                />
              ))
            ) : (
              <div className="p-4 text-center text-gray-500">
                No wallets detected. Please install a supported wallet
                extension.
              </div>
            )}
          </div>

          <div className="mt-6">
            <p className="text-xs text-center text-gray-500">
              By connecting your wallet, you agree to our Terms of Service and
              Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
