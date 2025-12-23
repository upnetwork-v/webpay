import Logo from '@/assets/img/logo.svg'
import { useAuthStore } from '@/stores'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/')({
  component: Index,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      auth_token: search['auth-token'] as string | undefined,
      error: search['error'] as string | undefined,
    }
  },
})

function Index() {
  const navigate = useNavigate()
  const { auth_token, error } = Route.useSearch()
  const {
    login,
    setError,
    isAuthenticated,
    isLoading,
    error: authError,
  } = useAuthStore()

  // Handle OAuth callback
  useEffect(() => {
    const handleAuthCallback = async () => {
      if (error) {
        console.error('Authentication error:', error)
        setError(`Authentication failed: ${error}`)
        return
      }

      if (auth_token) {
        try {
          // Login user
          await login(auth_token)

          // Get saved redirect route or default to wallet
          const redirectRoute =
            sessionStorage.getItem('ontapay_redirect_route') || '/wallet'
          sessionStorage.removeItem('ontapay_redirect_route')
          navigate({ to: redirectRoute })
        } catch (err) {
          console.error('Failed to process auth token:', err)
          setError('Failed to process authentication')
        }
      }
    }

    handleAuthCallback()
  }, [auth_token, error, login, setError, navigate])

  // Auto-redirect when not processing OAuth callback
  useEffect(() => {
    // Skip if we're processing OAuth callback
    if (auth_token || error) {
      return
    }

    // Skip if still loading auth state
    if (isLoading) {
      return
    }

    // Redirect based on auth state
    if (isAuthenticated) {
      navigate({ to: '/wallet' })
    } else {
      navigate({ to: '/login' })
    }
  }, [auth_token, error, isAuthenticated, isLoading, navigate])

  // Show loading state while processing OAuth or checking auth
  return (
    <div className="bg-base-200 hero min-h-screen">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <img src={Logo} alt="OntaPay" className="mx-auto mb-4 h-8" />
          <div className="loading loading-spinner loading-lg"></div>
          <p className="py-4">
            {error
              ? `Authentication failed: ${error}`
              : authError
                ? authError
                : 'Loading...'}
          </p>
        </div>
      </div>
    </div>
  )
}
