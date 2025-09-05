import React from "react";
import { getGoogleOauth2Url } from "@/utils/google";
import { useRouter } from "@tanstack/react-router";

interface GoogleLoginButtonProps {
  className?: string;
  children?: React.ReactNode;
  onLoginStart?: () => void;
}

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({
  className = "bg-gradient-to-b from-white rounded-full to-neutral-200 border-[0] text-neutral btn btn-primary btn-block btn-lg",
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
      {children}
    </button>
  );
};

export default GoogleLoginButton;
