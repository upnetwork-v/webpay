import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthStore } from "@/types/auth";
import { getUserInfo } from "@/api/auth";

const AUTH_STORAGE_KEY = "ontapay_auth";

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // State
      isAuthenticated: false,
      authToken: null,
      user: null,
      isLoading: false,
      error: null,

      // Actions
      login: async (token: string) => {
        set({
          isAuthenticated: true,
          authToken: token,
          isLoading: false,
          error: null,
        });

        const user = await getUserInfo();
        set({ user: user });
      },

      logout: () => {
        set({
          isAuthenticated: false,
          authToken: null,
          user: null,
          isLoading: false,
          error: null,
        });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error, isLoading: false });
      },

      checkAuth: () => {
        const { authToken, user } = get();
        const isAuthenticated = !!(authToken && user);

        if (isAuthenticated !== get().isAuthenticated) {
          set({ isAuthenticated });
        }

        return isAuthenticated;
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        authToken: state.authToken,
        user: state.user,
      }),
    }
  )
);

// Helper function to get auth token for API calls
export const getAuthToken = (): string | null => {
  return useAuthStore.getState().authToken;
};

// Helper function to check if user is authenticated
export const isAuthenticated = (): boolean => {
  return useAuthStore.getState().checkAuth();
};
