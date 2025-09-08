import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

/**
 * Hook to initialize auth store on app startup
 * This hook should be used in the root component to ensure
 * auth state is properly initialized when the app loads
 */
export const useAuthInitialization = () => {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    // Initialize auth store when component mounts
    initialize().catch((error) => {
      console.error("Failed to initialize auth store:", error);
    });
  }, [initialize]);
};
