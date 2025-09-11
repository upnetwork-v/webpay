import SumsubWebSdk from "@sumsub/websdk-react";
import { useKYCStore } from "@/stores";
import { useAuthStore } from "@/stores/authStore";

/**
 * Global KYC Modal Component
 * This component should be placed at the root level to ensure fullscreen display
 */
export default function KYCModal() {
  const {
    isKYCVisible,
    accessToken,
    config,
    options,
    sdkLoading,
    handleTokenExpiration,
    handleKYCError,
    setSdkLoading,
    closeKYC,
  } = useKYCStore();

  if (!isKYCVisible || !accessToken) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* KYC SDK Container */}
      <div
        className="relative w-full h-full bg-[#1b1b1f] overflow-y-auto"
        onClick={closeKYC}
      >
        {/* loading */}
        {sdkLoading && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 loading loading-spinner loading-lg"></div>
        )}

        <SumsubWebSdk
          accessToken={accessToken}
          expirationHandler={handleTokenExpiration}
          config={config}
          options={options}
          onMessage={(type: string, payload: any) => {
            console.log("KYC Message:", type, payload);
            if (type === "idCheck.onApplicantLoaded") {
              setSdkLoading(false);
            }
            // Handle completion event, refresh user status
            if (
              type === "idCheck.onApplicantStatusChanged" &&
              payload.reviewStatus === "completed"
            ) {
              // You can dispatch an event or call a callback here
              console.log("KYC Step completed, should refresh user status");
              // refresh user status
              setTimeout(() => {
                useAuthStore.getState().initialize();
              }, 2000);
              // close modal
              closeKYC();
            }
          }}
          onError={handleKYCError}
          className="relative z-2"
        />
      </div>
    </div>
  );
}
