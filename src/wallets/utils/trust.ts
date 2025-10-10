/**
 * Trust Wallet 工具函数
 */

import { PublicKey } from "@solana/web3.js";
// 内联常量定义
const SOLANA_SLIP44 = 501;
const SOLANA_TOKEN_ADDRESSES = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
} as const;

export interface TokenInfo {
  symbol: string;
  address?: string;
  decimals: number;
}

/**
 * 编码 UAI 格式 (Universal Asset ID)
 * @param chainSlip44 - Slip44 index (Solana = 501)
 * @param tokenAddress - SPL Token 地址（可选）
 * @returns UAI 格式字符串
 * @example
 * encodeUAI(501) // "c501" (SOL)
 * encodeUAI(501, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") // "c501_tEPj..." (USDC)
 */
export function encodeUAI(chainSlip44: number, tokenAddress?: string): string {
  if (tokenAddress) {
    // 验证 Solana 地址格式
    if (!isValidSolanaAddress(tokenAddress)) {
      throw new Error(`Invalid Solana token address: ${tokenAddress}`);
    }
    return `c${chainSlip44}_t${tokenAddress}`;
  }
  return `c${chainSlip44}`;
}

/**
 * 解码 UAI 格式
 * @param uai - UAI 格式字符串
 * @returns 解析后的 chainId 和 tokenAddress
 * @example
 * decodeUAI("c501") // { chainId: 501 }
 * decodeUAI("c501_tEPj...") // { chainId: 501, tokenAddress: "EPj..." }
 */
export function decodeUAI(uai: string): {
  chainId: number;
  tokenAddress?: string;
} {
  const match = uai.match(/^c(\d+)(?:_t(.+))?$/);
  if (!match) {
    throw new Error(`Invalid UAI format: ${uai}`);
  }

  return {
    chainId: parseInt(match[1]),
    tokenAddress: match[2],
  };
}

/**
 * 验证 Solana 地址
 * @param address - Solana 地址字符串
 * @returns 是否有效
 */
function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * 根据 token symbol 获取 UAI
 * @param symbol - Token 符号 (如 "SOL", "USDC", "USDT")
 * @returns UAI 格式字符串
 * @example
 * getUAIForToken("SOL") // "c501"
 * getUAIForToken("USDC") // "c501_tEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
 */
export function getUAIForToken(symbol: string): string {
  const upperSymbol = symbol.toUpperCase();

  if (upperSymbol === "SOL") {
    return encodeUAI(SOLANA_SLIP44);
  }

  const tokenAddress =
    SOLANA_TOKEN_ADDRESSES[upperSymbol as keyof typeof SOLANA_TOKEN_ADDRESSES];
  if (!tokenAddress) {
    throw new Error(`Unsupported token: ${symbol}`);
  }

  return encodeUAI(SOLANA_SLIP44, tokenAddress);
}

/**
 * 获取 Trust Wallet 下载链接（根据用户设备）
 * @returns App Store 或 Google Play 链接
 */
export function getTrustWalletDownloadLink(): string {
  const userAgent = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(userAgent)) {
    return "https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409";
  } else if (/android/.test(userAgent)) {
    return "https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp";
  }

  return "https://trustwallet.com/download";
}

/**
 * 检查是否可能安装了 Trust Wallet
 * （简化实现，实际需要通过 deeplink 测试）
 * @returns 是否可能已安装
 */
export function checkTrustWalletInstalled(): boolean {
  // 移动设备更可能安装钱包 App
  const userAgent = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod|android/.test(userAgent);
}

/**
 * 通过 deeplink 唤起 Trust Wallet app
 * @description 使用 Trust Wallet 的 deeplink 协议打开应用
 * 参考文档: https://developer.trustwallet.com/developer/develop-for-trust/deeplinking
 */
export function openTrustWalletApp(): void {
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobile = /iphone|ipad|ipod|android/.test(userAgent);

  if (isMobile) {
    // 移动端优先使用 trust:// deeplink 直接打开
    // 如果 app 未安装，会回退到 universal link
    const trustDeeplink = "trust://";
    const universalLink = "https://link.trustwallet.com";

    console.log("[TrustWallet] Opening Trust Wallet app via deeplink...");

    // 先尝试直接打开 deeplink
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = trustDeeplink;
    document.body.appendChild(iframe);

    // 延迟移除 iframe
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);

    // 设置一个后备方案：如果 deeplink 没有成功打开（可能未安装），使用 universal link
    setTimeout(() => {
      try {
        window.location.href = universalLink;
      } catch (error) {
        console.warn("[TrustWallet] Failed to open universal link:", error);
      }
    }, 2500);
  } else {
    // 桌面端不需要唤起 app
    console.log(
      "[TrustWallet] Desktop environment detected, skipping app launch"
    );
  }
}
