import Logo from '@/assets/img/logo.svg'
import { useRequireAuth } from '@/hooks'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/wallet')({
  component: Wallet,
})

function Wallet() {
  const { isAuthenticated, isLoading } = useRequireAuth()

  // Show loading while checking auth or redirecting
  if (isLoading || !isAuthenticated) {
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
          <h1 className="mb-4 text-3xl font-bold">Wallet</h1>
          <p className="py-4">Wallet content coming soon...</p>
        </div>
      </div>
    </div>
  )
}
