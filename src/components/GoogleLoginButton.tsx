import React from "react";
import { getGoogleOauth2Url } from "@/utils/google";
import { useRouter } from "@tanstack/react-router";

interface GoogleLoginButtonProps {
  className?: string;
  children?: React.ReactNode;
  onLoginStart?: () => void;
}

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({
  className = "bg-gradient-to-b from-white rounded-full to-neutral-200 border-[0] text-neutral btn btn-primary btn-block btn-lg font-normal",
  children = "Login with Google",
  onLoginStart,
}) => {
  const router = useRouter();

  const handleGoogleLogin = () => {
    try {
      onLoginStart?.();

      // 获取 Google OAuth2 URL
      const googleAuthUrl = getGoogleOauth2Url();

      if (!googleAuthUrl) {
        console.error("Failed to get Google OAuth2 URL");
        return;
      }

      // 保存当前页面 route path，用于登录后重定向
      const currentUrl = router.state.location.pathname;
      sessionStorage.setItem("ontapay_redirect_route", currentUrl);

      // 跳转到 Google 认证页面
      window.location.href = googleAuthUrl;
    } catch (error) {
      console.error("Google login failed:", error);
    }
  };

  return (
    <button className={className} onClick={handleGoogleLogin} type="button">
      <img
        src="data:image/svg+xml;charset=utf-8;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHhtbG5zOnhsaW5rPSdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rJyB2aWV3Qm94PScwIDAgNDggNDgnPjxkZWZzPjxwYXRoIGlkPSdhJyBkPSdNNDQuNSAyMEgyNHY4LjVoMTEuOEMzNC43IDMzLjkgMzAuMSAzNyAyNCAzN2MtNy4yIDAtMTMtNS44LTEzLTEzczUuOC0xMyAxMy0xM2MzLjEgMCA1LjkgMS4xIDguMSAyLjlsNi40LTYuNEMzNC42IDQuMSAyOS42IDIgMjQgMiAxMS44IDIgMiAxMS44IDIgMjRzOS44IDIyIDIyIDIyYzExIDAgMjEtOCAyMS0yMiAwLTEuMy0uMi0yLjctLjUtNHonLz48L2RlZnM+PGNsaXBQYXRoIGlkPSdiJz48dXNlIHhsaW5rOmhyZWY9JyNhJyBvdmVyZmxvdz0ndmlzaWJsZScvPjwvY2xpcFBhdGg+PHBhdGggY2xpcC1wYXRoPSd1cmwoI2IpJyBmaWxsPScjRkJCQzA1JyBkPSdNMCAzN1YxMWwxNyAxM3onLz48cGF0aCBjbGlwLXBhdGg9J3VybCgjYiknIGZpbGw9JyNFQTQzMzUnIGQ9J00wIDExbDE3IDEzIDctNi4xTDQ4IDE0VjBIMHonLz48cGF0aCBjbGlwLXBhdGg9J3VybCgjYiknIGZpbGw9JyMzNEE4NTMnIGQ9J00wIDM3bDMwLTIzIDcuOSAxTDQ4IDB2NDhIMHonLz48cGF0aCBjbGlwLXBhdGg9J3VybCgjYiknIGZpbGw9JyM0Mjg1RjQnIGQ9J000OCA0OEwxNyAyNGwtNC0zIDM1LTEweicvPjwvc3ZnPg=="
        alt="Google"
        className="w-6 h-6"
      />
      {children}
    </button>
  );
};

export default GoogleLoginButton;
