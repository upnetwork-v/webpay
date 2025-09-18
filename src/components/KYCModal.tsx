import SumsubWebSdk from "@sumsub/websdk-react";
import { useKYCStore } from "@/stores";
import { useAuthStore } from "@/stores/authStore";
import { useState, useEffect } from "react";

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
  const [waitingForReview, setWaitingForReview] = useState(false);
  const [showCountdown, setShowCountdown] = useState(true);
  const [countdown, setCountdown] = useState(120);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  // 10 种等待文案
  const waitingMessages = [
    "Waiting for review",
    "Please wait while we verify",
    "Verification in progress",
    "Reviewing your documents",
    "Processing your submission",
    "Please wait for approval",
    "Verification under review",
    "Documents being checked",
    "Awaiting manual review",
    "Please wait for confirmation",
  ];

  // Countdown timer effect
  useEffect(() => {
    if (!waitingForReview || countdown <= 0) {
      setShowCountdown(false);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [waitingForReview, countdown]);

  // Message rotation effect - switch message every 10 seconds
  useEffect(() => {
    if (!waitingForReview) return;

    const messageTimer = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % waitingMessages.length);
    }, 8000); // 8 seconds

    return () => clearInterval(messageTimer);
  }, [waitingForReview, waitingMessages.length]);

  // Format countdown as MM:SS
  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

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
        {/* waiting-for-review */}
        {waitingForReview && (
          <div className="absolute left-8 right-8 bottom-8 z-10">
            <div className="px-4 py-2 rounded-lg bg-black/30 text-center ">
              {showCountdown && (
                <span className="countdown">
                  <span
                    style={{ "--value": minutes } as React.CSSProperties}
                    aria-live="polite"
                    aria-label={`${minutes}`}
                  ></span>
                  :
                  <span
                    style={{ "--value": seconds } as React.CSSProperties}
                    aria-live="polite"
                    aria-label={`${seconds}`}
                  ></span>
                </span>
              )}
              <div className="text-xs">
                {waitingMessages[currentMessageIndex]}
                <span className="loading loading-dots loading-xs ml-1"></span>
              </div>
            </div>
          </div>
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
            if (
              type === "idCheck.onApplicantStatusChanged" &&
              (payload.reviewStatus === "pending" ||
                payload.reviewStatus === "prechecked")
            ) {
              setShowCountdown(true);
              setWaitingForReview(true);
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
              setWaitingForReview(false);
              setShowCountdown(false);
            }
          }}
          onError={handleKYCError}
          className="relative z-2"
        />
      </div>
    </div>
  );
}
