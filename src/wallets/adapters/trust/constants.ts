/**
 * Trust Wallet 集成常量
 */

export const TRUST_WALLET_CONSTANTS = {
  // Deep Link 相关
  WEB_DEEP_LINK_BASE: "https://link.trustwallet.com",
  NATIVE_DEEP_LINK_BASE: "trust://",

  // Solana 网络标识
  SOLANA_COIN_ID: "501",
  SOLANA_ASSET_PREFIX: "c501",

  // 超时设置
  CONNECTION_TIMEOUT: 30000, // 30秒
  DETECTION_TIMEOUT: 2000, // 2秒

  // WalletConnect 相关
  WALLETCONNECT_BRIDGE: "https://bridge.walletconnect.org",

  // 错误消息
  ERRORS: {
    NOT_INSTALLED: "Trust Wallet is not installed",
    CONNECTION_FAILED: "Failed to connect to Trust Wallet",
    TRANSACTION_FAILED: "Transaction failed",
    USER_REJECTED: "User rejected the request",
    NETWORK_ERROR: "Network error",
    TIMEOUT: "Connection timeout",
  },
} as const;

export const TRUST_WALLET_FEATURES = {
  DEEP_LINKING: true,
  WALLET_CONNECT: true,
  MOBILE_SUPPORT: true,
  DESKTOP_EXTENSION: true,
  SOLANA_SUPPORT: true,
  SPL_TOKEN_SUPPORT: true,
} as const;
