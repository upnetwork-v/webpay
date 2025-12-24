import Logo from '@/assets/img/logo.svg'
import { useRequireAuth } from '@/hooks'
import { useWallet } from '@/wallets/provider/useWallet'
import {
  createFileRoute,
  Link,
  Outlet,
  useMatches,
} from '@tanstack/react-router'

export const Route = createFileRoute('/wallet')({
  component: Wallet,
})

function Wallet() {
  const { isAuthenticated, isLoading } = useRequireAuth()
  const matches = useMatches()
  const { state, openWalletSelector } = useWallet()
  const { isConnected } = state

  // Check if we're on a child route (e.g., /wallet/scan)
  const isOnChildRoute = matches.some(
    (match) => match.id !== '/wallet' && match.id.startsWith('/wallet')
  )

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

  // If on a child route, render the child route component
  if (isOnChildRoute) {
    return <Outlet />
  }

  // Button styling matching order_id page
  const MainButtonClass =
    'bg-gradient-to-b from-white rounded-full to-neutral-200 border-[0] text-neutral btn btn-primary btn-block btn-lg'

  // Otherwise, show the wallet home page
  return (
    <div className="bg-base-200 hero min-h-screen">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <img src={Logo} alt="OntaPay" className="mx-auto mb-4 h-8" />
          <h1 className="mb-4 text-3xl font-bold">Wallet</h1>

          <div className="space-y-4">
            {!isConnected ? (
              // Show Connect Wallet button if not connected
              <>
                <p className="text-base-content/70 mb-4 text-sm">
                  Please connect your wallet to use payment features
                </p>
                <button
                  className={MainButtonClass}
                  onClick={openWalletSelector}
                >
                  Connect Wallet
                </button>
              </>
            ) : (
              // Show Scan-to-Pay Entry when connected
              <>
                <Link
                  to="/wallet/scan"
                  className="btn btn-primary btn-lg gap-2"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="h-6 w-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z"
                    />
                  </svg>
                  Scan to Pay
                </Link>

                <p className="text-base-content/70 py-4 text-sm">
                  More wallet features coming soon...
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
