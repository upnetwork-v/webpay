/**
 * Authentication related types for OntaPay KYC system
 */

export interface User {
  /**
   * 徽章数量
   */
  badge: number;
  createdAt: string;
  google_email: string;
  google_id: string;
  id: string;
  inviteCode: string;
  principal_id: string;
  /**
   * 白名单标志位
   */
  privilege: boolean;
  transaction_limit: string;
  transaction_total: string;
  updatedAt: string;
  username: string;
  /**
   * kyc状态，0 未验证
   * 1 验证中
   * 2 验证通过
   * 3 验证失败
   */
  verified: 0 | 1 | 2 | 3;
}

export interface UserResponse {
  code: number;
  data: User | null;
  message: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  authToken: string | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

export interface AuthActions {
  login: (token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  checkAuth: () => boolean;
  clearError: () => void;
  initialize: () => Promise<void>;
}

export interface AuthStore extends AuthState, AuthActions {}

export interface GoogleOAuthConfig {
  clientId: string;
  redirectUri: string;
  authorizeUrl: string;
  scopes: string[];
}
