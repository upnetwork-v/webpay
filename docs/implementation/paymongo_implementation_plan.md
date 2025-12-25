# PayMongo Scan-to-Pay Implementation Plan

## Phase 1: Core Utilities & Types ✅
- [x] **Migrate Utils**: Port `upnetwork-v2/src/utils/paymongo.ts` to `webpay/src/utils/paymongo.ts`.
  - `bignumber.js` dependency verified.
  - Imports refactored (no React Native specific code).
- [x] **Update Types**: Modify `src/types/payout.ts`.
  - Added `CreatePayoutParams` fields: `currency` (PHP), `country` (PH), `purpose`, `accountType`.

## Phase 2: Routing & Pages ✅
- [x] **Create Input Page**: `src/routes/wallet/pay/paymongo/index.tsx`
  - Purpose: Handle manual amount input for PayMongo QRs without embedded amount.
  - UI: Philippine Peso (₱) currency display with proper styling.
- [x] **Create Payment Page**: `src/routes/wallet/pay/paymongo/$payoutId.tsx`
  - Purpose: Review order details and execute Solana payment.
  - Logic: Fetch payout record, display exchange rate (PHP->USDC), sign & send transaction.
  - Reused: Logic pattern from PayNow payment page.

## Phase 3: Scanner Integration ✅
- [x] **Update Scanner**: `src/routes/wallet/scan.tsx`
  - Imported `isLikelyPayMongo` and `parsePayMongo`.
  - Added logic branch: If PayMongo QR detected -> Route to `/wallet/pay/paymongo` (with query params).

## Phase 4: Testing & Verification
- [ ] **Unit Tests**: Add tests for `utils/paymongo.ts` (optional but recommended).
- [ ] **Manual Test**:
  - Scan PayMongo QR -> Verify Routing.
  - Input Amount -> Verify API Call.
  - Payment -> Verify Wallet Sign & Transaction Broadcast.
  - Success Page -> Verify Status Polling.

## Completed: 2025-12-25
