import { fetchInstance } from "./index";
import type { User, UserResponse } from "@/types/auth";

/**
 * 获取用户信息
 */
export async function getUserInfo(): Promise<User | null> {
  try {
    const response = await fetchInstance.get<UserResponse>(
      `${import.meta.env.VITE_UP_SERVICE_API_HOST}/api/user`
    );
    if (response.code === 200) {
      return response.data as User | null;
    }
    return null;
  } catch (error) {
    console.error("Failed to get user info:", error);
    return null;
  }
}
