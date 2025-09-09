import { useState, useCallback } from "react";
import { getSumsubToken } from "@/api/kyc";
import { useAuthStore } from "@/stores/authStore";
import type { UseKYCReturn, KYCSDKConfig, KYCSDKOptions } from "@/types/kyc";
import snsWebSdk from "@sumsub/websdk";

export function useKYC(): UseKYCReturn {
  const [isKYCLoading, setIsKYCLoading] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);
  const { user, initialize } = useAuthStore();

  const launchKYC = useCallback(async () => {
    try {
      setIsKYCLoading(true);
      setKycError(null);

      // 1. Get Sumsub token
      const tokenData = await getSumsubToken();
      if (!tokenData) {
        throw new Error("Failed to get KYC token");
      }

      // 2. Prepare SDK configuration
      const config: KYCSDKConfig = {
        lang: "en",
        email: user?.google_email,
        phone: "", // Can be extended if phone is available in user data
      };

      const options: KYCSDKOptions = {
        addViewportTag: false,
        adaptIframeHeight: true,
      };

      // 3. Initialize Sumsub SDK
      const snsWebSdkInstance = snsWebSdk
        .init(tokenData.token, () => {
          // Token refresh callback
          return getSumsubToken().then((data) => data?.token || "");
        })
        .withConf(config)
        .withOptions(options)
        .on("idCheck.onStepCompleted", (payload: any) => {
          console.log("KYC Step Completed:", payload);
        })
        .on("idCheck.onError", (error: any) => {
          console.error("KYC Error:", error);
          setKycError("KYC verification failed");
        })
        .onMessage((type: string, payload: any) => {
          console.log("KYC Message:", type, payload);
          // Handle completion event, refresh user status
          if (type === "idCheck.onStepCompleted") {
            initialize(); // Refresh user status
          }
        })
        .build();

      // 4. Launch SDK
      snsWebSdkInstance.launch("#sumsub-websdk-container");
    } catch (error) {
      console.error("KYC Launch Error:", error);
      setKycError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setIsKYCLoading(false);
    }
  }, [user, initialize]);

  return {
    launchKYC,
    isKYCLoading,
    kycError,
  };
}
