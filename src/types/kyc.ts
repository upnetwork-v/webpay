/**
 * KYC related types for Sumsub SDK integration
 */

export interface KYCEvent {
  type: "onStepCompleted" | "onError" | "onMessage";
  payload: any;
}

export interface KYCOptions {
  lang?: string;
  email?: string;
  phone?: string;
}

export interface KYCSDKConfig {
  lang: string;
  email?: string;
  phone?: string;
}

export interface KYCSDKOptions {
  addViewportTag: boolean;
  adaptIframeHeight: boolean;
}

export interface UseKYCReturn {
  launchKYC: () => Promise<void>;
  isKYCLoading: boolean;
  kycError: string | null;
}
