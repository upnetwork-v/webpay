/**
 * Authentication related types for OntaPay KYC system
 * Supports both SIWS (Sign In With Solana) and legacy Google OAuth users
 */

/**
 * SIWS 用户核心字段（来自 /api/siws/user）
 */
export interface SIWSUserFields {
  id: string
  address: string
  chain: string
  createdAt: string
  updatedAt: string
  transaction_limit: string
  transaction_total: string
  /**
   * kyc状态
   * 0 - 未验证
   * 1 - 验证中
   * 2 - 验证通过
   * 3 - 验证失败
   */
  verified: 0 | 1 | 2 | 3
}

/**
 * 统一用户类型 - 兼容 SIWS 和 Google OAuth
 */
export interface User extends SIWSUserFields {
  // 以下字段为遗留 Google OAuth 字段，现为可选
  badge?: number
  google_email?: string
  google_id?: string
  inviteCode?: string
  principal_id?: string
  privilege?: boolean
  username?: string
}

export interface UserResponse {
  code: number
  data: User | null
  message: string
}

export interface AuthState {
  isAuthenticated: boolean
  authToken: string | null
  user: User | null
  isLoading: boolean
  error: string | null
  // SIWS 登录需要记录钱包地址
  walletAddress: string | null
}

export interface AuthActions {
  login: (token: string, address?: string) => void
  logout: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  checkAuth: () => boolean
  clearError: () => void
  initialize: () => Promise<void>
}

export interface AuthStore extends AuthState, AuthActions {}
