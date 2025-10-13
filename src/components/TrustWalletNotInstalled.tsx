/**
 * Trust Wallet 未安装引导组件
 * 当检测到用户未安装 Trust Wallet 时显示
 */

import { getTrustWalletDownloadLink } from "@/wallets/utils/trust";

interface TrustWalletNotInstalledProps {
    onClose?: () => void;
}

export function TrustWalletNotInstalled({
    onClose,
}: TrustWalletNotInstalledProps) {
    const downloadLink = getTrustWalletDownloadLink();
    const platform = getPlatformName();

    return (
        <div className="alert alert-info">
            <div className="flex-1">
                <h3 className="font-bold text-lg">未检测到 Trust Wallet</h3>
                <p className="text-sm mt-2">
                    Trust Wallet 是一个安全的去中心化钱包，支持 Solana 等多条区块链。
                </p>

                <div className="mt-4 space-y-2">
                    <button
                        className="btn btn-primary btn-sm w-full"
                        onClick={() => window.open(downloadLink, "_blank")}
                    >
                        📱 前往 {platform} 下载 Trust Wallet
                    </button>

                    <div className="text-xs text-gray-600 dark:text-gray-400">
                        <p>✅ 推荐版本：v8.0 或更高</p>
                        <p>✅ 支持 iOS 15+ 和 Android 10+</p>
                    </div>

                    <details className="text-xs mt-3">
                        <summary className="cursor-pointer font-semibold">
                            ℹ️ 为什么需要 Trust Wallet？
                        </summary>
                        <div className="mt-2 space-y-1 text-gray-600 dark:text-gray-400">
                            <p>
                                • Trust Wallet 是全球领先的去中心化钱包之一
                            </p>
                            <p>• 支持 70+ 区块链和 800 万+ 数字资产</p>
                            <p>• 通过 ISO 27701/27001 安全认证</p>
                            <p>• 您完全掌控私钥，资产安全可靠</p>
                        </div>
                    </details>

                    <details className="text-xs mt-2">
                        <summary className="cursor-pointer font-semibold">
                            🔄 已经安装了？
                        </summary>
                        <div className="mt-2 text-gray-600 dark:text-gray-400">
                            <p>
                                如果您已经安装了 Trust Wallet，请确保：
                            </p>
                            <ul className="list-disc list-inside mt-1">
                                <li>应用已更新到最新版本</li>
                                <li>已创建或导入钱包</li>
                                <li>网络连接正常</li>
                            </ul>
                            <p className="mt-2">
                                然后刷新页面重试连接。
                            </p>
                        </div>
                    </details>
                </div>
            </div>

            {onClose && (
                <button className="btn btn-sm btn-circle btn-ghost" onClick={onClose}>
                    ✕
                </button>
            )}
        </div>
    );
}

/**
 * 获取平台名称
 */
function getPlatformName(): string {
    const userAgent = navigator.userAgent.toLowerCase();

    if (/iphone|ipad|ipod/.test(userAgent)) {
        return "App Store";
    } else if (/android/.test(userAgent)) {
        return "Google Play";
    }

    return "官网";
}

