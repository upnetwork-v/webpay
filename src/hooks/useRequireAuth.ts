import { useAuthStore } from '@/stores/authStore'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'

/**
 * Hook to require authentication for a page
 * If user is not authenticated, saves current path and redirects to login
 * @returns { isAuthenticated, isLoading } - Current auth state
 */
export const useRequireAuth = () => {
  const { isAuthenticated, isLoading } = useAuthStore()
  const navigate = useNavigate()
  const location = useRouterState({ select: (s) => s.location })

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Save current path for redirect after login
      sessionStorage.setItem('ontapay_redirect_route', location.pathname)
      navigate({ to: '/login' })
    }
  }, [isAuthenticated, isLoading, navigate, location.pathname])

  return { isAuthenticated, isLoading }
}
