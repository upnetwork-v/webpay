/**
 * 交易确认弹窗组件
 * 用于在签名前二次确认交易详情，防止钓鱼攻击
 */

interface TransactionConfirmModalProps {
    open: boolean;
    transaction: {
        to: string;
        amount: string;
        token: string;
        estimatedFee: string;
        memo?: string;
    } | null;
    onConfirm: () => void;
    onCancel: () => void;
}

export function TransactionConfirmModal({
    open,
    transaction,
    onConfirm,
    onCancel,
}: TransactionConfirmModalProps) {
    if (!transaction) return null;

    return (
        <>
            <input
                type="checkbox"
                className="modal-toggle"
                checked={open}
                readOnly
            />
            <div
                className="modal items-end"
                style={{ pointerEvents: open ? "auto" : "none" }}
            >
                <div className="modal-box">
                    <h3 className="font-bold text-lg mb-4">⚠️ 请确认交易详情</h3>

                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                接收地址
                            </p>
                            <p className="font-mono text-xs break-all bg-base-200 p-2 rounded mt-1">
                                {transaction.to}
                            </p>
                        </div>

                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                转账金额
                            </p>
                            <p className="text-2xl font-bold text-primary mt-1">
                                {transaction.amount} {transaction.token}
                            </p>
                        </div>

                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                预估手续费
                            </p>
                            <p className="text-sm mt-1">{transaction.estimatedFee} SOL</p>
                        </div>

                        {transaction.memo && (
                            <div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    备注信息
                                </p>
                                <p className="text-xs font-mono bg-base-200 p-2 rounded mt-1">
                                    {transaction.memo}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="alert alert-warning mt-4">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="stroke-current shrink-0 h-6 w-6"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                        <span className="text-sm">
                            ⚠️ 请在钱包中仔细核对交易信息，确认无误后再签名
                        </span>
                    </div>

                    <div className="modal-action">
                        <button className="btn btn-ghost" onClick={onCancel}>
                            取消
                        </button>
                        <button className="btn btn-primary" onClick={onConfirm}>
                            确认并签名
                        </button>
                    </div>
                </div>
                <div className="modal-backdrop" onClick={onCancel}></div>
            </div>
        </>
    );
}

