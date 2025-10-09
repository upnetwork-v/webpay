/**
 * 统一的钱包错误处理
 */

export enum WalletErrorCode {
  // 连接相关
  CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
  CONNECTION_FAILED = "CONNECTION_FAILED",
  ALREADY_CONNECTED = "ALREADY_CONNECTED",
  NOT_CONNECTED = "NOT_CONNECTED",

  // 用户操作
  USER_REJECTED = "USER_REJECTED",
  USER_CANCELLED = "USER_CANCELLED",

  // 交易相关
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  INVALID_TRANSACTION = "INVALID_TRANSACTION",
  SIGNATURE_VERIFICATION_FAILED = "SIGNATURE_VERIFICATION_FAILED",

  // 网络相关
  NETWORK_ERROR = "NETWORK_ERROR",
  RPC_ERROR = "RPC_ERROR",

  // 服务相关
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  RELAY_ERROR = "RELAY_ERROR",

  // 其他
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
  UNSUPPORTED_OPERATION = "UNSUPPORTED_OPERATION",
}

export class WalletError extends Error {
  public readonly code: WalletErrorCode;
  public readonly recoverable: boolean;
  public readonly originalError?: Error;

  constructor(
    code: WalletErrorCode,
    message: string,
    recoverable: boolean = true,
    originalError?: Error
  ) {
    super(message);
    this.name = "WalletError";
    this.code = code;
    this.recoverable = recoverable;
    this.originalError = originalError;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WalletError);
    }
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(): string {
    switch (this.code) {
      case WalletErrorCode.CONNECTION_TIMEOUT:
        return "连接钱包超时，请检查网络后重试";
      case WalletErrorCode.USER_REJECTED:
        return "您已取消连接";
      case WalletErrorCode.USER_CANCELLED:
        return "操作已取消";
      case WalletErrorCode.INSUFFICIENT_BALANCE:
        return "余额不足，请充值后再试";
      case WalletErrorCode.SERVICE_UNAVAILABLE:
        return "WalletConnect 服务暂时不可用，请稍后重试";
      case WalletErrorCode.TRANSACTION_FAILED:
        return "交易失败，请重试";
      case WalletErrorCode.NOT_CONNECTED:
        return "钱包未连接，请先连接钱包";
      case WalletErrorCode.INVALID_TRANSACTION:
        return "交易数据无效";
      default:
        return this.message || "操作失败，请重试";
    }
  }

  /**
   * 是否应该自动重试
   */
  shouldRetry(): boolean {
    const retryableCodes = [
      WalletErrorCode.CONNECTION_TIMEOUT,
      WalletErrorCode.NETWORK_ERROR,
      WalletErrorCode.SERVICE_UNAVAILABLE,
      WalletErrorCode.RELAY_ERROR,
    ];
    return this.recoverable && retryableCodes.includes(this.code);
  }
}

/**
 * 错误工厂函数
 */
export function createWalletError(error: unknown): WalletError {
  if (error instanceof WalletError) {
    return error;
  }

  if (error instanceof Error) {
    // 解析常见错误类型
    if (error.message.includes("timeout")) {
      return new WalletError(
        WalletErrorCode.CONNECTION_TIMEOUT,
        error.message,
        true,
        error
      );
    }

    if (
      error.message.includes("rejected") ||
      error.message.includes("cancelled")
    ) {
      return new WalletError(
        WalletErrorCode.USER_REJECTED,
        error.message,
        false,
        error
      );
    }

    if (error.message.includes("insufficient")) {
      return new WalletError(
        WalletErrorCode.INSUFFICIENT_BALANCE,
        error.message,
        false,
        error
      );
    }

    if (error.message.includes("relay") || error.message.includes("Relay")) {
      return new WalletError(
        WalletErrorCode.RELAY_ERROR,
        error.message,
        true,
        error
      );
    }

    // 默认错误
    return new WalletError(
      WalletErrorCode.UNKNOWN_ERROR,
      error.message,
      true,
      error
    );
  }

  // 非 Error 对象
  return new WalletError(WalletErrorCode.UNKNOWN_ERROR, String(error), true);
}
