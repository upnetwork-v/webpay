import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/wallet/pay')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/wallet/pay"!</div>
}
