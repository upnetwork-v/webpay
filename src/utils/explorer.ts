export const getSolanaExplorerUrl = (signature: string): string => {
  // Default to mainnet explorer, can be made configurable if needed
  return `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`;
};
