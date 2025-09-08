import type { User } from "@/types/auth";

export default function KYCStatus({
  user,
  upToLimit,
}: {
  user: User | null;
  upToLimit: boolean;
}) {
  if (!user) {
    return null;
  }

  if (upToLimit) {
    return (
      <div className="p-2">
        <button className="btn btn-primary btn-block">
          Complete KYC to pay
        </button>
      </div>
    );
  }

  return (
    <div className="p-2 text-xs">
      {user?.verified === 0 && (
        <>
          {Number(user.transaction_total)}SGD / {Number(user.transaction_limit)}
          SGD transactions used
          {/* 提示 kyc 可以获得无限交易额度 */}
          <div className="text-warning mt-2">
            <button className="link link-warning link-xs">Complete KYC</button>{" "}
            to get unlimited transaction limit
          </div>
        </>
      )}
      {/* kyc 正在审核中 */}
      {user?.verified === 1 && <div> KYC is being reviewed</div>}

      {user?.verified === 3 && <div className="text-error">KYC failed</div>}
    </div>
  );
}
