import Logo from '@/assets/img/logo.svg'
import { useAuthStore } from '@/stores'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useAuthStore()

  // Auto-redirect based on auth state
  useEffect(() => {
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
  }, [isAuthenticated, isLoading, navigate])

  // Show loading state while checking auth
  return (
    <div className="bg-base-200 hero min-h-screen">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <img src={Logo} alt="OntaPay" className="mx-auto mb-4 h-8" />
          <div className="loading loading-spinner loading-lg"></div>
          <p className="py-4">Loading...</p>
        </div>
      </div>
    </div>
  )
}
