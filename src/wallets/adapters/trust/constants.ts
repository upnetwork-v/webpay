/**
 * Trust Wallet 集成常量
 */

export const TRUST_WALLET_CONSTANTS = {
  // Deep Link 相关 (备选方案)
  WEB_DEEP_LINK_BASE: "https://link.trustwallet.com",
  NATIVE_DEEP_LINK_BASE: "trust://",

  // Solana 网络标识
  SOLANA_COIN_ID: "501",
  SOLANA_ASSET_PREFIX: "c501",

  // WalletConnect v2 相关
  WALLETCONNECT: {
    PROJECT_ID: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "",
    METADATA: {
      name: "OntaPay",
      description: "OntaPay - Solana Payment Gateway",
      url: typeof window !== "undefined" ? window.location.origin : "",
      icons: [
        typeof window !== "undefined"
          ? window.location.origin + "/apple-touch-icon.png"
          : "",
      ] as string[],
    },
    SOLANA_NAMESPACE: {
      solana: {
        methods: [
          "solana_signTransaction",
          "solana_signAndSendTransaction",
          "solana_signMessage",
        ] as string[],
        chains: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"] as string[], // Mainnet
        events: ["chainChanged", "accountsChanged"] as string[],
      },
    },
  },

  // 超时设置
  CONNECTION_TIMEOUT: 30000, // 30秒
  DETECTION_TIMEOUT: 2000, // 2秒

  // 错误消息
  ERRORS: {
    NOT_INSTALLED: "Trust Wallet is not installed",
    CONNECTION_FAILED: "Failed to connect to Trust Wallet",
    TRANSACTION_FAILED: "Transaction failed",
    USER_REJECTED: "User rejected the request",
    NETWORK_ERROR: "Network error",
    TIMEOUT: "Connection timeout",
    WALLETCONNECT_INIT_FAILED: "WalletConnect initialization failed",
    NO_SESSION: "No active WalletConnect session",
    INVALID_TRANSACTION: "Invalid transaction format",
  },
} as const;

export const TRUST_WALLET_FEATURES = {
  DEEP_LINKING: true,
  MOBILE_SUPPORT: true,
  DESKTOP_EXTENSION: true,
  SOLANA_SUPPORT: true,
  SPL_TOKEN_SUPPORT: true,
  WALLETCONNECT_V2: true,
} as const;
