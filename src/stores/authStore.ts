import {
  getUserInfo as getSIWSUserInfo,
  type GetUserInfoData,
} from '@/api/siws'
import type { AuthStore, User } from '@/types/auth'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const AUTH_STORAGE_KEY = 'ontapay_auth'

/**
 * 将 SIWS API 返回的用户数据转换为 User 类型
 */
function mapSIWSUserToUser(data: GetUserInfoData): User {
  return {
    id: data.id,
    address: data.address,
    chain: data.chain,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    transaction_limit: data.transaction_limit,
    transaction_total: data.transaction_total,
    verified: data.verified as 0 | 1 | 2 | 3,
  }
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // State
      isAuthenticated: false,
      authToken: null,
      user: null,
      isLoading: false,
      error: null,
      walletAddress: null,

      // Actions
      login: async (token: string, address?: string) => {
        set({
          isAuthenticated: true,
          authToken: token,
          walletAddress: address || null,
          isLoading: false,
          error: null,
        })

        // 如果提供了地址，使用 SIWS API 获取用户信息
        if (address) {
          const userData = await getSIWSUserInfo()
          if (userData) {
            set({ user: mapSIWSUserToUser(userData) })
          }
        }
      },

      logout: () => {
        set({
          isAuthenticated: false,
          authToken: null,
          user: null,
          isLoading: false,
          error: null,
          walletAddress: null,
        })
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      setError: (error: string | null) => {
        set({ error, isLoading: false })
      },

      checkAuth: () => {
        const { authToken, user } = get()
        const isAuthenticated = !!(authToken && user)

        if (isAuthenticated !== get().isAuthenticated) {
          set({ isAuthenticated })
        }

        return isAuthenticated
      },

      clearError: () => {
        set({ error: null })
      },

      // 初始化方法：在 store 创建时自动调用
      initialize: async () => {
        const { authToken, walletAddress } = get()

        // 如果有 token 和钱包地址，尝试获取用户信息
        if (authToken && walletAddress) {
          set({ isLoading: true })
          try {
            const userData = await getSIWSUserInfo()
            if (userData) {
              set({
                user: mapSIWSUserToUser(userData),
                isAuthenticated: true,
                isLoading: false,
                error: null,
              })
            } else {
              // 如果获取用户信息失败，清除认证状态
              set({
                isAuthenticated: false,
                authToken: null,
                user: null,
                walletAddress: null,
                isLoading: false,
                error: 'Failed to get user info',
              })
            }
          } catch (error) {
            console.error('Failed to initialize auth:', error)
            set({
              isAuthenticated: false,
              authToken: null,
              user: null,
              walletAddress: null,
              isLoading: false,
              error: 'Failed to initialize auth',
            })
          }
        }
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        authToken: state.authToken,
        user: state.user,
        walletAddress: state.walletAddress,
      }),
    }
  )
)

// Helper function to get auth token for API calls
export const getAuthToken = (): string | null => {
  return useAuthStore.getState().authToken
}

// Helper function to check if user is authenticated
export const isAuthenticated = (): boolean => {
  return useAuthStore.getState().checkAuth()
}
