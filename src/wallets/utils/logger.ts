/**
 * 钱包操作日志系统
 */

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export interface WalletLogEntry {
  timestamp: number;
  level: LogLevel;
  walletType: string;
  action: string;
  data?: Record<string, unknown>;
  error?: Error;
}

export class WalletLogger {
  private static logs: WalletLogEntry[] = [];
  private static maxLogs = 100;

  /**
   * 记录连接操作
   */
  static logConnection(
    walletType: string,
    success: boolean,
    duration: number,
    error?: Error
  ): void {
    const entry: WalletLogEntry = {
      timestamp: Date.now(),
      level: success ? LogLevel.INFO : LogLevel.ERROR,
      walletType,
      action: "connect",
      data: { success, duration },
      error,
    };

    this.addLog(entry);

    console.log(
      `[Wallet] ${walletType} connection ${success ? "succeeded" : "failed"} in ${duration}ms`,
      error || ""
    );

    // 发送到 Analytics（如果配置）
    if (typeof window !== "undefined" && "gtag" in window) {
      const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;
      gtag?.("event", "wallet_connection", {
        wallet_type: walletType,
        success,
        duration,
      });
    }
  }

  /**
   * 记录交易操作
   */
  static logTransaction(
    walletType: string,
    orderId: string,
    signature: string | null,
    success: boolean,
    error?: Error
  ): void {
    const entry: WalletLogEntry = {
      timestamp: Date.now(),
      level: success ? LogLevel.INFO : LogLevel.ERROR,
      walletType,
      action: "transaction",
      data: { orderId, signature, success },
      error,
    };

    this.addLog(entry);

    console.log(
      `[Wallet] ${walletType} transaction for order ${orderId}: ${success ? signature : "failed"}`,
      error || ""
    );

    // 发送到后端日志（异步，不影响主流程）
    this.sendToBackend(entry);
  }

  /**
   * 记录签名操作
   */
  static logSignature(
    walletType: string,
    success: boolean,
    duration: number,
    error?: Error
  ): void {
    const entry: WalletLogEntry = {
      timestamp: Date.now(),
      level: success ? LogLevel.INFO : LogLevel.ERROR,
      walletType,
      action: "sign",
      data: { success, duration },
      error,
    };

    this.addLog(entry);

    console.log(
      `[Wallet] ${walletType} signature ${success ? "succeeded" : "failed"} in ${duration}ms`,
      error || ""
    );
  }

  /**
   * 记录一般操作
   */
  static log(
    level: LogLevel,
    walletType: string,
    action: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    const entry: WalletLogEntry = {
      timestamp: Date.now(),
      level,
      walletType,
      action,
      data,
      error,
    };

    this.addLog(entry);

    const logMethod = level === LogLevel.ERROR ? console.error : console.log;
    logMethod(
      `[Wallet] [${level}] ${walletType}.${action}`,
      data || "",
      error || ""
    );
  }

  /**
   * 添加日志条目
   */
  private static addLog(entry: WalletLogEntry): void {
    this.logs.push(entry);

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  /**
   * 发送日志到后端
   */
  private static async sendToBackend(entry: WalletLogEntry): Promise<void> {
    try {
      await fetch("/api/logs/wallet-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: entry.timestamp,
          level: entry.level,
          walletType: entry.walletType,
          action: entry.action,
          data: entry.data,
          error: entry.error?.message,
        }),
      });
    } catch (err) {
      // 静默失败，不影响主流程
      console.warn("Failed to send log to backend:", err);
    }
  }

  /**
   * 获取所有日志
   */
  static getLogs(filter?: {
    walletType?: string;
    action?: string;
  }): WalletLogEntry[] {
    if (!filter) return [...this.logs];

    return this.logs.filter((log) => {
      if (filter.walletType && log.walletType !== filter.walletType)
        return false;
      if (filter.action && log.action !== filter.action) return false;
      return true;
    });
  }

  /**
   * 清空日志
   */
  static clearLogs(): void {
    this.logs = [];
  }

  /**
   * 导出日志（调试用）
   */
  static exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}
