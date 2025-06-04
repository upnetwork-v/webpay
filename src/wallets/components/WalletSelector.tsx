import * as React from "react";
import type { WalletOption, WalletType } from "@/wallets/types/wallet";
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
  const [localSelected, setLocalSelected] = React.useState<WalletType | null>(
    selectedWalletType
  );
  React.useEffect(() => {
    if (open) setLocalSelected(selectedWalletType);
  }, [open, selectedWalletType]);

  // 连接/断开按钮
  const handleAction = () => {
    if (isConnected) {
      onDisconnect();
    } else {
      if (localSelected) {
        onSelectWallet(localSelected);
        onConnect();
      }
    }
  };

  return (
    <>
      {/* DaisyUI modal 控制 open/close */}
      <input type="checkbox" className="modal-toggle" checked={open} readOnly />
      <div className="modal" style={{ pointerEvents: open ? "auto" : "none" }}>
        <div className="max-w-md p-0 modal-box">
          <div className="border-b px-6 pt-4 pb-2">
            <h3 className="font-bold text-lg">Select Wallet</h3>
          </div>
          <div className="px-6 pt-2 pb-4">
            <div className="flex flex-col gap-2">
              {wallets.map((w) => (
                <button
                  key={w.type}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${localSelected === w.type ? "border-primary bg-primary/10" : "border-base-200"}`}
                  onClick={() => setLocalSelected(w.type)}
                  disabled={isLoading}
                  type="button"
                >
                  {w.icon}
                  <span className="font-medium flex-1 text-left">{w.name}</span>
                  {selectedWalletType === w.type && isConnected && (
                    <span className="font-semibold text-xs text-green-600">
                      Connected
                    </span>
                  )}
                  {localSelected === w.type && !isConnected && (
                    <span className="text-xs text-primary">Selected</span>
                  )}
                </button>
              ))}
            </div>
            {error && <div className="mt-3 text-sm text-error">{error}</div>}
            <button
              className={`btn mt-6 w-full ${isConnected ? "btn-outline" : "btn-primary"}`}
              onClick={handleAction}
              disabled={isLoading || (!isConnected && !localSelected)}
              type="button"
            >
              {isLoading && <Loader2 className="mr-2 animate-spin size-4" />}
              {isConnected ? "Disconnect" : "Connect"}
            </button>
          </div>
          <div className="px-6 pb-4 modal-action">
            <button
              className="btn btn-sm btn-ghost"
              onClick={onClose}
              type="button"
            >
              Close
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
