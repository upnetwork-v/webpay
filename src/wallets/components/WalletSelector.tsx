import React, { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { WalletType } from '../types';

interface WalletSelectorProps {
  onSelect?: (walletType: WalletType) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  className?: string;
}

/**
 * 钱包选择器组件，允许用户选择和连接钱包
 */
export const WalletSelector: React.FC<WalletSelectorProps> = ({
  onSelect,
  onConnect,
  onDisconnect,
  className = '',
}) => {
  const {
    supportedWallets,
    walletType,
    connected,
    connecting,
    disconnecting,
    publicKey,
    connect,
    disconnect,
    switchWallet,
  } = useWallet();
  
  const [showWalletList, setShowWalletList] = useState(false);
  const [returnURL, setReturnURL] = useState('');
  
  // 设置返回 URL
  useEffect(() => {
    setReturnURL(window.location.href);
  }, []);
  
  // 处理钱包选择
  const handleWalletSelect = async (type: WalletType) => {
    setShowWalletList(false);
    
    if (type !== walletType) {
      await switchWallet(type);
      onSelect?.(type);
    }
  };
  
  // 处理钱包连接
  const handleConnect = async () => {
    try {
      await connect({ returnURL });
      onConnect?.();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };
  
  // 处理钱包断开连接
  const handleDisconnect = async () => {
    try {
      await disconnect();
      onDisconnect?.();
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };
  
  // 格式化公钥显示
  const formatPublicKey = (pubkey: string) => {
    if (!pubkey) return '';
    return `${pubkey.substring(0, 4)}...${pubkey.substring(pubkey.length - 4)}`;
  };
  
  return (
    <div className={`wallet-selector ${className}`}>
      {connected ? (
        <div className="wallet-connected">
          <div className="wallet-info">
            <img
              src={supportedWallets.find(w => w.type === walletType)?.icon}
              alt={walletType || 'Wallet'}
              className="wallet-icon"
            />
            <span className="wallet-address">
              {publicKey ? formatPublicKey(publicKey.toString()) : ''}
            </span>
          </div>
          <button
            className="disconnect-button"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? '断开中...' : '断开连接'}
          </button>
        </div>
      ) : (
        <div className="wallet-selector-container">
          <button
            className="wallet-select-button"
            onClick={() => setShowWalletList(!showWalletList)}
          >
            <span>选择钱包</span>
          </button>
          
          {walletType && (
            <button
              className="connect-button"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? '连接中...' : '连接'}
            </button>
          )}
          
          {showWalletList && (
            <div className="wallet-list">
              {supportedWallets.map(wallet => (
                <div
                  key={wallet.type}
                  className={`wallet-item ${walletType === wallet.type ? 'selected' : ''}`}
                  onClick={() => handleWalletSelect(wallet.type)}
                >
                  <img src={wallet.icon} alt={wallet.name} className="wallet-icon" />
                  <span className="wallet-name">{wallet.name}</span>
                  {!wallet.isInstalled() && (
                    <span className="wallet-install-hint">未安装</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WalletSelector;
