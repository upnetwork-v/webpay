# PayMongo Scan-to-Pay Implementation Plan

## Phase 1: Core Utilities & Types
- [ ] **Migrate Utils**: Port `upnetwork-v2/src/utils/paymongo.ts` to `webpay/src/utils/paymongo.ts`.
  - Ensure `bignumber.js` dependency is available.
  - Refactor imports (remove React Native specific code if any).
- [ ] **Update Types**: Modify `src/types/payout.ts`.
  - Add `CreatePayoutParams` fields: `currency` (PHP), `country` (PH), `purpose`, `accountType`.
  - Update `PayoutData` if necessary (e.g. `cryptoCurrency` handling).

## Phase 2: Routing & Pages
- [ ] **Create Input Page**: `src/routes/wallet/pay/paymongo/index.tsx`
  - Purpose: Handle manual amount input for PayMongo QRs without embedded amount.
  - UI: Similar to PayNow input but with PHP currency and PayMongo specific styling (if any).
- [ ] **Create Payment Page**: `src/routes/wallet/pay/paymongo/$payoutId.tsx`
  - Purpose: Review order details and execute Solana payment.
  - Logic: Fetch payout record, display exchange rate (PHP->USDC), sign & send transaction.
  - Reuse: Logic from PayNow payment page (`src/routes/wallet/pay/paynow/$payoutId.tsx`).

## Phase 3: Scanner Integration
- [ ] **Update Scanner**: `src/routes/wallet/scan.tsx`
  - Import `isLikelyPayMongo` and `parsePayMongo`.
  - Add logic branch: If PayMongo QR detected -> Route to `/wallet/pay/paymongo` (with query params).

## Phase 4: Testing & Verification
- [ ] **Unit Tests**: Add tests for `utils/paymongo.ts` (optional but recommended).
- [ ] **Manual Test**:
  - Scan PayMongo QR -> Verify Routing.
  - Input Amount -> Verify API Call.
  - Payment -> Verify Wallet Sign & Transaction Broadcast.
  - Success Page -> Verify Status Polling.
