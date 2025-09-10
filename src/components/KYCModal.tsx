import SumsubWebSdk from "@sumsub/websdk-react";
import { useKYCStore } from "@/stores";

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
    handleTokenExpiration,
    handleKYCMessage,
    handleKYCError,
    closeKYC,
  } = useKYCStore();

  console.log("🔍 KYCModal render:", {
    isKYCVisible,
    accessToken: !!accessToken,
  });

  if (!isKYCVisible || !accessToken) {
    console.log("❌ KYCModal not rendering:", {
      isKYCVisible,
      accessToken: !!accessToken,
    });
    return null;
  }

  console.log("✅ KYCModal rendering with fullscreen modal");

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* KYC SDK Container */}
      <div
        className="relative w-full h-full bg-black flex flex-col justify-center"
        onClick={closeKYC}
      >
        {/* loading */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 loading loading-spinner loading-lg"></div>

        <SumsubWebSdk
          accessToken={accessToken}
          expirationHandler={handleTokenExpiration}
          config={config}
          options={options}
          onMessage={handleKYCMessage}
          onError={handleKYCError}
          className="relative z-2"
        />
      </div>
    </div>
  );
}
