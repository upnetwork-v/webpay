import { fetchInstance } from "./index";
import type {
  LoginResponse,
  TokenValidationResponse,
  User,
} from "@/types/auth";

/**
 * 验证 token 有效性
 */
export async function validateToken(
  token: string
): Promise<TokenValidationResponse> {
  try {
    const response = await fetchInstance.post<TokenValidationResponse>(
      "/auth/validate",
      { token },
      { skipAuth: true }
    );
    return response;
  } catch (error) {
    console.error("Token validation failed:", error);
    return {
      valid: false,
      message:
        error instanceof Error ? error.message : "Token validation failed",
    };
  }
}

/**
 * 刷新 token
 */
export async function refreshToken(): Promise<LoginResponse | null> {
  try {
    const response = await fetchInstance.post<LoginResponse>("/auth/refresh");
    return response;
  } catch (error) {
    console.error("Token refresh failed:", error);
    return null;
  }
}

/**
 * 获取用户信息
 */
export async function getUserInfo(): Promise<User | null> {
  try {
    const response = await fetchInstance.get<User>("/auth/user");
    return response;
  } catch (error) {
    console.error("Failed to get user info:", error);
    return null;
  }
}

/**
 * 登出
 */
export async function logout(): Promise<void> {
  try {
    await fetchInstance.post("/auth/logout");
  } catch (error) {
    console.error("Logout failed:", error);
  }
}
