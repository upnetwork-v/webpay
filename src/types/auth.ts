/**
 * Authentication related types for OntaPay KYC system
 */

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  authToken: string | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: User;
  message?: string;
}

export interface AuthActions {
  login: (token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  checkAuth: () => boolean;
  clearError: () => void;
}

export interface AuthStore extends AuthState, AuthActions {}

export interface GoogleOAuthConfig {
  clientId: string;
  redirectUri: string;
  authorizeUrl: string;
  scopes: string[];
}

export interface TokenValidationResponse {
  valid: boolean;
  user?: User;
  message?: string;
}
