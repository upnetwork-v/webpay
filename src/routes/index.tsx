import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/stores";
import Logo from "@/assets/img/logo.svg";

export const Route = createFileRoute("/")({
  component: Index,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      auth_token: search["auth-token"] as string | undefined,
      error: search["error"] as string | undefined,
    };
  },
});

function Index() {
  const navigate = useNavigate();
  const { auth_token, error } = Route.useSearch();
  const { login, setError } = useAuthStore();

  useEffect(() => {
    const handleAuthCallback = async () => {
      if (error) {
        console.error("Authentication error:", error);
        setError(`Authentication failed: ${error}`);
        return;
      }

      // 获取重定向 URL
      const redirectRoute = sessionStorage.getItem("ontapay_redirect_route");

      if (auth_token && redirectRoute) {
        try {
          // 登录用户
          login(auth_token);

          sessionStorage.removeItem("ontapay_redirect_route");
          navigate({ to: redirectRoute });
        } catch (err) {
          console.error("Failed to process auth token:", err);
          setError("Failed to process authentication");
        }
      }
    };

    handleAuthCallback();
  }, [auth_token, error, login, setError, navigate]);

  // 显示加载状态
  if (auth_token || error) {
    return (
      <div className="min-h-screen bg-base-200 hero">
        <div className="text-center hero-content">
          <div className="max-w-md">
            <img src={Logo} alt="OntaPay" className="mx-auto h-8 mb-4" />
            <div className="loading loading-spinner loading-lg"></div>
            <p className="py-4">
              {error ? "Authentication failed" : "Processing authentication..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 正常首页内容
  return (
    <div className="min-h-screen bg-base-200 hero">
      <div className="text-center hero-content">
        <div className="max-w-md">
          <img src={Logo} alt="OntaPay" className="mx-auto h-8 mb-4" />
          <h1 className="font-bold text-3xl mb-4">Welcome to OntaPay</h1>
          <p className="py-4">Secure cryptocurrency payments for merchants</p>
        </div>
      </div>
    </div>
  );
}
