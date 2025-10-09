/**
 * 钱包错误提示组件
 * 根据错误类型显示不同的提示信息和操作建议
 */

import { WalletError, WalletErrorCode } from "@/wallets/errors/WalletError";

interface WalletErrorDisplayProps {
    error: WalletError | Error | null;
    onRetry?: () => void;
    onDismiss?: () => void;
    className?: string;
}

export function WalletErrorDisplay({
    error,
    onRetry,
    onDismiss,
    className = "",
}: WalletErrorDisplayProps) {
    if (!error) return null;

    const walletError = error instanceof WalletError ? error : null;
    const showRetry = walletError?.shouldRetry() && onRetry;

    return (
        <div className={`alert alert-error ${className}`}>
            <div className="flex-1">
                <h4 className="font-bold">
                    {walletError ? getErrorTitle(walletError.code) : "操作失败"}
                </h4>
                <p className="text-sm mt-1">
                    {walletError ? walletError.getUserMessage() : error.message}
                </p>

                {walletError?.code === WalletErrorCode.SERVICE_UNAVAILABLE && (
                    <p className="text-xs mt-2 opacity-80">
                        💡 提示：您也可以尝试使用其他钱包（Phantom 或 OKX）
                    </p>
                )}

                {walletError?.code === WalletErrorCode.CONNECTION_TIMEOUT && (
                    <p className="text-xs mt-2 opacity-80">
                        💡 建议：检查网络连接，或稍后重试
                    </p>
                )}

                {walletError?.code === WalletErrorCode.NOT_CONNECTED && (
                    <p className="text-xs mt-2 opacity-80">
                        💡 提示：请先点击"连接钱包"按钮
                    </p>
                )}
            </div>

            <div className="flex gap-2">
                {showRetry && (
                    <button className="btn btn-sm btn-ghost" onClick={onRetry}>
                        重试
                    </button>
                )}
                {onDismiss && (
                    <button className="btn btn-sm btn-ghost" onClick={onDismiss}>
                        关闭
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * 根据错误码获取错误标题
 */
function getErrorTitle(code: WalletErrorCode): string {
    switch (code) {
        case WalletErrorCode.CONNECTION_TIMEOUT:
            return "连接超时";
        case WalletErrorCode.CONNECTION_FAILED:
            return "连接失败";
        case WalletErrorCode.USER_REJECTED:
        case WalletErrorCode.USER_CANCELLED:
            return "用户取消";
        case WalletErrorCode.INSUFFICIENT_BALANCE:
            return "余额不足";
        case WalletErrorCode.TRANSACTION_FAILED:
            return "交易失败";
        case WalletErrorCode.INVALID_TRANSACTION:
            return "交易无效";
        case WalletErrorCode.SERVICE_UNAVAILABLE:
        case WalletErrorCode.RELAY_ERROR:
            return "服务暂时不可用";
        case WalletErrorCode.NETWORK_ERROR:
            return "网络错误";
        case WalletErrorCode.NOT_CONNECTED:
            return "钱包未连接";
        case WalletErrorCode.ALREADY_CONNECTED:
            return "已连接";
        default:
            return "操作失败";
    }
}

