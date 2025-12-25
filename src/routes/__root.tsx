import KYCModal from '@/components/KYCModal'
import { useAuthInitialization } from '@/hooks'
import '@/index.css'
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import VConsole from 'vconsole'

function NotFound() {
  return (
    <div className="p-8 text-center text-red-600">
      <h1 className="mb-2 text-2xl font-bold">404 - Page Not Found</h1>
      <p className="mb-4">
        Sorry, the page you are looking for does not exist.
      </p>
      <Link to="/" className="text-blue-600 underline">
        Go Home
      </Link>
    </div>
  )
}

export const Route = createRootRoute({
  component: () => {
    new VConsole()

    // Initialize auth store when app starts
    useAuthInitialization()

    return (
      <>
        <Outlet />
        <KYCModal />
      </>
    )
  },
  notFoundComponent: NotFound,
})
