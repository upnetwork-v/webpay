import Logo from '@/assets/img/logo.svg'
import GoogleLoginButton from '@/components/GoogleLoginButton'
import { useAuthStore } from '@/stores'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/login')({
  component: Login,
})

function Login() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useAuthStore()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // User is already logged in, redirect to saved route or wallet
      const redirectRoute =
        sessionStorage.getItem('ontapay_redirect_route') || '/wallet'
      sessionStorage.removeItem('ontapay_redirect_route')
      navigate({ to: redirectRoute })
    }
  }, [isAuthenticated, isLoading, navigate])

  // Show loading while checking auth state
  if (isLoading) {
    return (
      <div className="bg-base-200 hero min-h-screen">
        <div className="hero-content text-center">
          <div className="loading loading-spinner loading-lg"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-base-200 hero min-h-screen">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <img src={Logo} alt="OntaPay" className="mx-auto mb-4 h-8" />
          <h1 className="mb-4 text-3xl font-bold">Welcome to OntaPay</h1>
          <p className="mb-4 py-4">Please login to continue</p>
          <GoogleLoginButton />
        </div>
      </div>
    </div>
  )
}
