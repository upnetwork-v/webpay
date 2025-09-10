import { create } from "zustand";
import { getSumsubToken } from "@/api/kyc";
import type { KYCSDKConfig, KYCSDKOptions } from "@/types/kyc";
import { useAuthStore } from "@/stores/authStore";

interface KYCState {
  isKYCLoading: boolean;
  kycError: string | null;
  isKYCVisible: boolean;
  accessToken: string | null;
  config: KYCSDKConfig | null;
  options: KYCSDKOptions | null;
}

interface KYCActions {
  launchKYC: () => Promise<void>;
  closeKYC: () => void;
  setKYCError: (error: string | null) => void;
  handleTokenExpiration: () => Promise<string>;
  handleKYCMessage: (type: string, payload: any) => void;
  handleKYCError: (error: any) => void;
}

type KYCStore = KYCState & KYCActions;

export const useKYCStore = create<KYCStore>((set) => ({
  // State
  isKYCLoading: false,
  kycError: null,
  isKYCVisible: false,
  accessToken: null,
  config: null,
  options: null,

  // Actions
  launchKYC: async () => {
    try {
      console.log("🚀 Launching KYC...");
      set({ isKYCLoading: true, kycError: null });

      // 1. Get Sumsub token
      console.log("📡 Getting Sumsub token...");
      const tokenData = await getSumsubToken();
      console.log("✅ Token received:", tokenData);

      if (!tokenData) {
        throw new Error("Failed to get KYC token");
      }

      // 2. Prepare config and options
      const config: KYCSDKConfig = {
        lang: "en",
        theme: "dark",
      };

      const options: KYCSDKOptions = {
        addViewportTag: false,
        adaptIframeHeight: true,
      };

      // 3. Set token and show KYC
      console.log("🔑 Setting access token and showing KYC...");
      set({
        accessToken: tokenData.token,
        isKYCVisible: true,
        config,
        options,
      });
      console.log("✅ KYC should be visible now");
    } catch (error) {
      console.error("❌ KYC Launch Error:", error);
      set({
        kycError: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      set({ isKYCLoading: false });
    }
  },

  closeKYC: () => {
    console.log("🔒 Closing KYC");
    set({
      isKYCVisible: false,
      accessToken: null,
      kycError: null,
      config: null,
      options: null,
    });
  },

  setKYCError: (error: string | null) => {
    set({ kycError: error });
  },

  handleTokenExpiration: async () => {
    try {
      const tokenData = await getSumsubToken();
      return tokenData?.token || "";
    } catch (error) {
      console.error("Token refresh failed:", error);
      return "";
    }
  },

  handleKYCMessage: (type: string, payload: any) => {
    console.log("KYC Message:", type, payload);
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
      set({ isKYCVisible: false });
    }
  },

  handleKYCError: (error: any) => {
    console.error("KYC Error:", error);
    set({ kycError: "KYC verification failed" });
  },
}));
