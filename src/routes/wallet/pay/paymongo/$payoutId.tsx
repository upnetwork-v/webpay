import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/wallet/pay/paymongo/$payoutId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/wallet/pay/paymongo/$payoutId"!</div>
}
