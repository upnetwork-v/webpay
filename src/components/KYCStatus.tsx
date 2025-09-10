import type { User } from "@/types/auth";
import { useKYC } from "@/hooks";

export default function KYCStatus({
  user,
  upToLimit,
}: {
  user: User | null;
  upToLimit: boolean;
}) {
  const { launchKYC, isKYCLoading, kycError } = useKYC();

  if (!user) {
    return null;
  }

  if (upToLimit) {
    return (
      <div className="p-2">
        <button
          className="btn btn-primary btn-block rounded-full btn-lg"
          onClick={launchKYC}
          disabled={isKYCLoading}
        >
          {isKYCLoading ? "Loading..." : "Complete KYC to pay"}
        </button>
        {kycError && <div className="text-error text-xs mt-2">{kycError}</div>}
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
            <button
              className="link link-warning link-xs"
              onClick={launchKYC}
              disabled={isKYCLoading}
            >
              {isKYCLoading ? "Loading..." : "Complete KYC"}
            </button>{" "}
            to get unlimited transaction limit
          </div>
        </>
      )}
      {/* kyc 正在审核中 */}
      {user?.verified === 1 && <div> KYC is being reviewed</div>}

      {user?.verified === 3 && (
        <div className="text-error">
          KYC failed
          <button
            className="link link-error link-xs ml-2"
            onClick={launchKYC}
            disabled={isKYCLoading}
          >
            {isKYCLoading ? "Loading..." : "Retry KYC"}
          </button>
        </div>
      )}
      {kycError && <div className="text-error text-xs mt-2">{kycError}</div>}
    </div>
  );
}
