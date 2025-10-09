/**
 * Trust Wallet 集成常量定义
 */

// Solana Chain ID for WalletConnect
// Format: solana:{genesisHash}
export const SOLANA_MAINNET_CHAIN_ID =
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const SOLANA_DEVNET_CHAIN_ID = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

// Slip44 index for Solana
export const SOLANA_SLIP44 = 501;

// WalletConnect namespace
export const WALLETCONNECT_NAMESPACE = "solana";

// Solana RPC methods
export const SOLANA_METHODS = {
  SIGN_TRANSACTION: "solana_signTransaction",
  SIGN_MESSAGE: "solana_signMessage",
  SIGN_AND_SEND_TRANSACTION: "solana_signAndSendTransaction",
} as const;

// Storage keys
export const TRUST_SESSION_KEY = "trust_wallet_session";
export const TRUST_PENDING_TX_KEY = "trust_pending_transaction";

// Timeouts
export const CONNECTION_TIMEOUT = 30000; // 30 seconds
export const TRANSACTION_TIMEOUT = 60000; // 60 seconds

// Retry configuration
export const RETRY_ATTEMPTS = 3;
export const RETRY_DELAY = 2000; // 2 seconds

// Session expiry
export const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Trust Wallet deeplink base URL
export const TRUST_DEEPLINK_BASE = "https://link.trustwallet.com";

// Well-known Solana Token addresses
export const SOLANA_TOKEN_ADDRESSES = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
} as const;
