/**
 * Trust Wallet Deep Link 工具函数
 */
import type { PaymentParams } from "./types";
import { TRUST_WALLET_CONSTANTS } from "./constants";
import { TrustWalletDetector } from "./detector";

export class TrustWalletDeepLink {
  private detector: TrustWalletDetector;

  constructor() {
    this.detector = new TrustWalletDetector();
  }

  /**
   * 生成支付 Deep Link
   */
  generatePaymentLink(params: PaymentParams): string {
    const baseUrl = this.getDeepLinkBase();
    const searchParams = new URLSearchParams();

    // 设置资产类型 (默认为 Solana)
    const asset = params.asset || TRUST_WALLET_CONSTANTS.SOLANA_ASSET_PREFIX;
    searchParams.set("asset", asset);

    // 设置收款地址
    searchParams.set("address", params.address);

    // 设置支付金额 (如果提供)
    if (params.amount !== undefined) {
      searchParams.set("amount", params.amount.toString());
    }

    // 设置备注信息 (如果提供)
    if (params.memo) {
      searchParams.set("memo", params.memo);
    }

    // 设置额外数据 (如果提供)
    if (params.data) {
      searchParams.set("data", params.data);
    }

    return `${baseUrl}/send?${searchParams.toString()}`;
  }

  /**
   * 生成 WalletConnect 连接 Deep Link
   */
  generateConnectionLink(wcUri: string): string {
    const baseUrl = this.getDeepLinkBase();
    const encodedUri = encodeURIComponent(wcUri);
    return `${baseUrl}/wc?uri=${encodedUri}`;
  }

  /**
   * 生成 DApp 浏览器 Deep Link
   */
  generateDAppLink(url: string, coinId?: string): string {
    const baseUrl = this.getDeepLinkBase();
    const searchParams = new URLSearchParams();

    searchParams.set("url", url);
    searchParams.set(
      "coin_id",
      coinId || TRUST_WALLET_CONSTANTS.SOLANA_COIN_ID
    );

    return `${baseUrl}/open_url?${searchParams.toString()}`;
  }

  /**
   * 生成资产查看 Deep Link
   */
  generateAssetLink(asset: string): string {
    const baseUrl = this.getDeepLinkBase();
    return `${baseUrl}/open_coin?asset=${asset}`;
  }

  /**
   * 打开 Trust Wallet
   */
  async openTrustWallet(link: string): Promise<boolean> {
    try {
      // 检测设备类型
      const browserInfo = this.detector.getBrowserInfo();

      if (browserInfo.isMobile) {
        // 移动端直接跳转
        window.location.href = link;
        return true;
      } else {
        // 桌面端在新窗口打开
        const popup = window.open(link, "_blank", "noopener,noreferrer");
        return popup !== null;
      }
    } catch (error) {
      console.error("Failed to open Trust Wallet:", error);
      return false;
    }
  }

  /**
   * 处理降级方案
   */
  async handleFallback(originalLink: string): Promise<void> {
    const isInstalled = await this.detector.isTrustWalletInstalled();

    if (!isInstalled) {
      // 如果未安装，转换为 Web Deep Link 引导下载
      const webLink = this.convertToWebDeepLink(originalLink);
      window.open(webLink, "_blank", "noopener,noreferrer");
    } else {
      // 如果已安装但跳转失败，重试或显示错误
      throw new Error(TRUST_WALLET_CONSTANTS.ERRORS.CONNECTION_FAILED);
    }
  }

  /**
   * 发起支付请求
   */
  async requestPayment(params: PaymentParams): Promise<boolean> {
    try {
      const paymentLink = this.generatePaymentLink(params);
      const success = await this.openTrustWallet(paymentLink);

      if (!success) {
        await this.handleFallback(paymentLink);
      }

      return true;
    } catch (error) {
      console.error("Payment request failed:", error);
      return false;
    }
  }

  /**
   * 发起连接请求
   */
  async requestConnection(wcUri: string): Promise<boolean> {
    try {
      const connectionLink = this.generateConnectionLink(wcUri);
      const success = await this.openTrustWallet(connectionLink);

      if (!success) {
        await this.handleFallback(connectionLink);
      }

      return true;
    } catch (error) {
      console.error("Connection request failed:", error);
      return false;
    }
  }

  /**
   * 获取 Deep Link 基础 URL
   */
  private getDeepLinkBase(): string {
    const browserInfo = this.detector.getBrowserInfo();

    // 移动端优先使用原生协议，桌面端使用 Web 协议
    if (browserInfo.isMobile && this.detector.supportsFeature("deeplink")) {
      return TRUST_WALLET_CONSTANTS.NATIVE_DEEP_LINK_BASE.slice(0, -3); // 去掉 '://'
    }

    return TRUST_WALLET_CONSTANTS.WEB_DEEP_LINK_BASE;
  }

  /**
   * 转换为 Web Deep Link
   */
  private convertToWebDeepLink(originalLink: string): string {
    // 如果原链接是原生协议，转换为 Web 协议
    if (originalLink.startsWith(TRUST_WALLET_CONSTANTS.NATIVE_DEEP_LINK_BASE)) {
      return originalLink.replace(
        TRUST_WALLET_CONSTANTS.NATIVE_DEEP_LINK_BASE,
        TRUST_WALLET_CONSTANTS.WEB_DEEP_LINK_BASE + "/"
      );
    }

    return originalLink;
  }

  /**
   * 验证地址格式
   */
  private validateAddress(address: string): boolean {
    // Solana 地址验证 (简单版本)
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  /**
   * 验证支付参数
   */
  validatePaymentParams(params: PaymentParams): {
    valid: boolean;
    error?: string;
  } {
    if (!params.address) {
      return { valid: false, error: "Address is required" };
    }

    if (!this.validateAddress(params.address)) {
      return { valid: false, error: "Invalid address format" };
    }

    if (
      params.amount !== undefined &&
      (params.amount <= 0 || !Number.isFinite(params.amount))
    ) {
      return { valid: false, error: "Invalid amount" };
    }

    return { valid: true };
  }

  /**
   * 格式化 UAI 资产标识符
   */
  formatAssetUAI(coinType: string = "501", contractAddress?: string): string {
    if (contractAddress) {
      // SPL Token 格式: c501_t{contract_address}
      return `c${coinType}_t${contractAddress}`;
    } else {
      // 原生代币格式: c501
      return `c${coinType}`;
    }
  }
}
