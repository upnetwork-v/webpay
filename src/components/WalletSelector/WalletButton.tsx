import React from 'react';

interface WalletButtonProps {
  name: string;
  icon: string;
  onClick: () => void;
}

export const WalletButton: React.FC<WalletButtonProps> = ({
  name,
  icon,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center w-full p-4 space-x-3 text-left transition-colors duration-200 rounded-lg hover:bg-gray-100"
    >
      <img src={icon} alt={`${name} logo`} className="w-8 h-8" />
      <span className="font-medium">{name}</span>
    </button>
  );
};
