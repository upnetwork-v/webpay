/**
 * Trust Wallet 设备检测和协议支持检测
 */
import type { BrowserInfo, TrustWalletDetectionResult } from "./types";
import { TRUST_WALLET_CONSTANTS } from "./constants";

export class TrustWalletDetector {
  /**
   * 检测浏览器信息
   */
  getBrowserInfo(): BrowserInfo {
    const userAgent = navigator.userAgent.toLowerCase();

    return {
      isMobile: this.isMobile(),
      isIOS: /iphone|ipad|ipod/.test(userAgent),
      isAndroid: /android/.test(userAgent),
      browser: this.getBrowserName(userAgent),
      userAgent: navigator.userAgent,
    };
  }

  /**
   * 检测是否为移动端设备
   */
  isMobile(): boolean {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  /**
   * 检测是否为 iOS 设备
   */
  isIOS(): boolean {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  /**
   * 检测是否为 Android 设备
   */
  isAndroid(): boolean {
    return /Android/i.test(navigator.userAgent);
  }

  /**
   * 获取浏览器名称
   */
  private getBrowserName(userAgent: string): string {
    if (userAgent.includes("chrome")) return "Chrome";
    if (userAgent.includes("firefox")) return "Firefox";
    if (userAgent.includes("safari")) return "Safari";
    if (userAgent.includes("edge")) return "Edge";
    if (userAgent.includes("opera")) return "Opera";
    return "Unknown";
  }

  /**
   * 检测 Trust Wallet 是否已安装
   */
  async isTrustWalletInstalled(): Promise<boolean> {
    const browserInfo = this.getBrowserInfo();

    if (browserInfo.isMobile) {
      // 移动端通过尝试打开 trust:// 协议检测
      return this.canOpenTrustProtocol();
    } else {
      // 桌面端检查浏览器扩展
      return this.checkBrowserExtension();
    }
  }

  /**
   * 检测是否能打开 Trust Wallet 协议
   */
  async canOpenTrustProtocol(): Promise<boolean> {
    return new Promise((resolve) => {
      // 设置超时
      const timeout = setTimeout(() => {
        resolve(false);
      }, TRUST_WALLET_CONSTANTS.DETECTION_TIMEOUT);

      try {
        // 创建隐藏的 iframe 尝试打开协议
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.style.position = "absolute";
        iframe.style.left = "-9999px";
        iframe.src = `${TRUST_WALLET_CONSTANTS.NATIVE_DEEP_LINK_BASE}`;

        document.body.appendChild(iframe);

        // 如果协议打开成功，页面会失去焦点
        const handleVisibilityChange = () => {
          if (document.hidden) {
            clearTimeout(timeout);
            cleanup();
            resolve(true);
          }
        };

        const handleBlur = () => {
          clearTimeout(timeout);
          cleanup();
          resolve(true);
        };

        const cleanup = () => {
          document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange
          );
          window.removeEventListener("blur", handleBlur);
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("blur", handleBlur);

        // 1秒后清理并假设不支持
        setTimeout(() => {
          clearTimeout(timeout);
          cleanup();
          resolve(false);
        }, 1000);
      } catch (error) {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  }

  /**
   * 检测浏览器扩展
   */
  private checkBrowserExtension(): boolean {
    // 检查 window 对象中是否有 Trust Wallet 相关的属性
    return (
      typeof window !== "undefined" &&
      // @ts-ignore
      (window.trustwallet !== undefined ||
        // @ts-ignore
        window.trustWallet !== undefined ||
        // @ts-ignore
        (window.ethereum && window.ethereum.isTrust) ||
        // @ts-ignore
        (window.solana && window.solana.isTrust))
    );
  }

  /**
   * 综合检测 Trust Wallet 支持情况
   */
  async detectTrustWallet(): Promise<TrustWalletDetectionResult> {
    const browserInfo = this.getBrowserInfo();
    const isInstalled = await this.isTrustWalletInstalled();

    return {
      isInstalled,
      supportsDeepLink: browserInfo.isMobile || isInstalled,
      supportsWalletConnect: true, // WalletConnect 总是支持的
      version: this.getTrustWalletVersion(),
      browserInfo,
    };
  }

  /**
   * 获取 Trust Wallet 版本信息
   */
  private getTrustWalletVersion(): string | undefined {
    try {
      // @ts-ignore
      if (window.trustwallet?.version) {
        // @ts-ignore
        return window.trustwallet.version;
      }
      // @ts-ignore
      if (window.ethereum?.isTrust && window.ethereum?.version) {
        // @ts-ignore
        return window.ethereum.version;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 检测是否支持特定功能
   */
  supportsFeature(feature: "deeplink" | "walletconnect" | "solana"): boolean {
    switch (feature) {
      case "deeplink":
        return this.isMobile() || this.checkBrowserExtension();
      case "walletconnect":
        return true; // WalletConnect 总是支持的
      case "solana":
        return true; // Trust Wallet 支持 Solana
      default:
        return false;
    }
  }
}
