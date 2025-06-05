import { useEffect, useState } from "react";
import type { WalletOption, WalletType } from "../types/wallet";
import { Loader2 } from "lucide-react";

interface WalletSelectorProps {
  open: boolean;
  onClose: () => void;
  wallets: WalletOption[];
  selectedWalletType: WalletType | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  onSelectWallet: (type: WalletType) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

const WalletSelector: React.FC<WalletSelectorProps> = ({
  open,
  onClose,
  wallets,
  selectedWalletType,
  isConnected,
  isLoading,
  error,
  onSelectWallet,
  onConnect,
  onDisconnect,
}) => {
  // 本地选中钱包，弹窗打开时重置为 props.selectedWalletType
  const [localSelected, setLocalSelected] = useState<WalletType | null>(
    selectedWalletType
  );
  useEffect(() => {
    if (open) {
      setLocalSelected(selectedWalletType);
      if (!selectedWalletType) {
        onSelectWallet(wallets[0]?.type);
      }
    }
  }, [open, selectedWalletType]);

  // 连接/断开按钮
  const handleAction = () => {
    if (isConnected) {
      onDisconnect();
    } else {
      if (localSelected) {
        onConnect();
      }
    }
  };

  return (
    <>
      <input type="checkbox" className="modal-toggle" checked={open} readOnly />
      <div
        className="modal items-end"
        style={{ pointerEvents: open ? "auto" : "none" }}
      >
        <div className="mb-4 p-0 modal-box">
          <h3 className="text-center text-lg py-4">
            Select a wallet to continue
          </h3>
          <div className="px-6 pt-2 pb-4">
            <div className="flex flex-col gap-2">
              {wallets.map((w) => (
                <div
                  key={w.type}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${localSelected === w.type ? "border-primary bg-primary/10" : "border-transparent"}`}
                  onClick={() => {
                    setLocalSelected(w.type);
                    onSelectWallet(w.type);
                  }}
                >
                  {w.icon}
                  <div className="font-medium flex-1 text-left">
                    {w.name}
                    {selectedWalletType === w.type && isConnected && (
                      <span className="text-xs text-neutral-content">
                        Wallet Connected
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {error && <div className="mt-3 text-sm text-error">{error}</div>}
            <button
              className="rounded-full mt-4 btn btn-primary btn-block btn-lg"
              disabled={isLoading || (!isConnected && !localSelected)}
              onClick={handleAction}
            >
              {isLoading && <Loader2 className="mr-2 animate-spin size-4" />}
              {isConnected ? "Disconnect" : "Connect"}
            </button>
          </div>
        </div>
        {/* 背景遮罩点击关闭 */}
        <label className="modal-backdrop" onClick={onClose}></label>
      </div>
    </>
  );
};

export default WalletSelector;
