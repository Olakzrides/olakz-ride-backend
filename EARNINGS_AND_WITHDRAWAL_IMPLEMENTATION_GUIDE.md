# EARNINGS & WITHDRAWAL IMPLEMENTATION GUIDE

## Current State (What's Missing)

Based on full code review:

**Fare model (rides):**
- `ride_fare_config` table is admin-configurable and already exists with `service_fee`, `rounding_fee`, `booking_fee`, `fleet_commission_percent`
- `FareService.calculateCompletionFare()` already returns both `totalFare` (what passenger pays) and `driverFare` (driver's portion = billing_unit × distance, no platform fees)
- Both `final_fare` and `final_driver_fare` are already stored on the `rides` table at completion

**What's already working:**
- Wallet rides: passenger hold is converted to `finalFare` (full customer amount) ✓
- Cash rides: `RemittanceService.handleCashRideRemittance()` deducts `service_fee + rounding_fee` from driver's wallet after `confirmCashPayment` ✓
- Driver is blocked from accepting rides if remittance is outstanding ✓

**What's missing:**
- For **wallet rides**: after `convertHoldToPayment` succeeds, the driver's wallet is **never credited** with `finalDriverFare`. The driver's earnings are lost.
- For **cash rides**: driver keeps the physical cash — no wallet credit needed. Remittance already handles the platform fee deduction. This path is fine.
- The `increment_driver_earnings` DB function exists but is **never called** — `total_earnings` on the `drivers` table is never updated.
- There is **no withdrawal system** — no bank account storage, no payout endpoint, no payout history.
- Vendors (food, marketplace) also have no earnings crediting or withdrawal mechanism.

---

## Phase 1 — Fix Driver Earnings Crediting (Wallet Rides Only)

**Goal:** When a wallet-paid ride completes, credit the driver's wallet with `finalDriverFare`.

### What to do

**In `services/core-logistics/src/services/driver-ride.service.ts` — `completeTrip` method:**

After `convertHoldToPayment` succeeds (wallet rides only — skip for cash), add:

1. Get the driver's `user_id` from the `drivers` table using `driverId`
2. Call `POST /api/internal/payment/wallet/credit` with:
   - `user_id`: driver's user_id
   - `amount`: `finalDriverFare`
   - `reference`: `earning_ride_{rideId}_{timestamp}`
   - `description`: `Ride earnings - {rideId}`
   - `transaction_type`: `earning`
3. Call `supabase.rpc('increment_driver_earnings', { p_driver_id: driverId, p_amount: finalDriverFare })` to update `total_earnings` on the driver record

**Note on cash rides:** Cash drivers already have the money in hand. No wallet credit needed. The remittance system already handles deducting the platform fee from their wallet. Do not credit cash ride earnings to the wallet.

**Note on `transaction_type`:** Use `'earning'` as the type. The `WalletService.getBalance()` in payment-service currently handles `'credit'` and `'refund'` as additions. Add `'earning'` to that same list so it counts toward the balance.

### Files to touch
- `services/core-logistics/src/services/driver-ride.service.ts` — `completeTrip` method
- `services/payment-service/src/services/wallet.service.ts` — add `'earning'` to balance calculation

### DB changes needed
- None — `wallet_transactions` table already supports any `transaction_type` string
- `increment_driver_earnings` DB function already exists

### Deliverable
Wallet ride completes → driver's wallet balance increases by `finalDriverFare` → `total_earnings` on driver record updates. Cash rides unchanged.

---

## Phase 2 — Bank Account Management

**Goal:** Allow drivers and vendors to save their bank account details so they can withdraw earnings.

### What to do

**1. New DB table: `bank_accounts`**

```sql
CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  account_number VARCHAR(20) NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  bank_code VARCHAR(10) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**2. Flutterwave bank list endpoint** — Flutterwave has `GET /banks/NG` to fetch all Nigerian banks with their codes. Add a proxy endpoint so the frontend can show a bank picker.

**3. Flutterwave account name verification** — Flutterwave has `POST /accounts/resolve` to verify that an account number + bank code returns the correct account name. Call this before saving the bank account so users don't save wrong details.

**4. New endpoints in payment-service:**

- `GET /api/payment/banks` — returns list of Nigerian banks from Flutterwave
- `POST /api/payment/bank-accounts` — add a bank account (verifies account name first)
- `GET /api/payment/bank-accounts` — list user's saved bank accounts
- `DELETE /api/payment/bank-accounts/:id` — remove a bank account
- `PATCH /api/payment/bank-accounts/:id/default` — set default bank account

**5. Gateway routing:** Add `/api/payment/banks` and `/api/payment/bank-accounts` to gateway routes pointing to payment-service.

### Files to touch
- `services/payment-service/src/services/flutterwave.service.ts` — add `getBanks()` and `resolveAccount()` methods
- `services/payment-service/src/controllers/` — new `bank-accounts.controller.ts`
- `services/payment-service/src/routes/` — new `bank-accounts.routes.ts`
- `services/payment-service/src/app.ts` — register new routes
- `gateway/src/routes/index.ts` — add gateway routes
- New Supabase migration for `bank_accounts` table

### Deliverable
User can add, list, and remove bank accounts. Account name is verified before saving.

---

## Phase 3 — Withdrawal (Payout to Bank)

**Goal:** Allow drivers and vendors to withdraw their wallet balance to their registered bank account.

### What to do

**1. Flutterwave Transfer API** — Flutterwave has `POST /transfers` to send money to a bank account. Add `initiateTransfer()` to `flutterwave.service.ts`.

**2. New `withdrawals` table:**

```sql
CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  amount DECIMAL(12,2) NOT NULL,
  fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_amount DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  flw_transfer_id VARCHAR(100),
  flw_reference VARCHAR(100),
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Status values: `pending`, `processing`, `completed`, `failed`

**3. Withdrawal flow:**

1. User requests withdrawal — validate they have sufficient balance (amount + fee)
2. Deduct amount from wallet immediately (status: `processing`) — this prevents double withdrawal
3. Call Flutterwave transfer API
4. If Flutterwave accepts: save withdrawal record with `flw_transfer_id`, status `processing`
5. Flutterwave sends webhook when transfer completes or fails:
   - On success: update withdrawal to `completed`
   - On failure: update withdrawal to `failed`, refund amount back to wallet

**4. Minimum withdrawal amount:** ₦1,000 (confirm before implementing)

**5. Withdrawal fee:** Flutterwave charges a transfer fee (typically ₦10–₦50 depending on amount). Deduct this from the user's wallet on top of the withdrawal amount, or absorb it as platform cost — decide before implementing.

**6. New endpoints in payment-service:**

- `POST /api/payment/withdrawals` — initiate a withdrawal
- `GET /api/payment/withdrawals` — list withdrawal history
- `POST /api/payment/webhooks/flutterwave` — receive Flutterwave transfer webhook (no auth, verified by Flutterwave hash)

**7. Gateway routing:** Add withdrawal and webhook routes.

### Files to touch
- `services/payment-service/src/services/flutterwave.service.ts` — add `initiateTransfer()`
- `services/payment-service/src/controllers/` — new `withdrawals.controller.ts`
- `services/payment-service/src/routes/` — new `withdrawals.routes.ts`
- `services/payment-service/src/app.ts` — register new routes
- `gateway/src/routes/index.ts` — add gateway routes
- New Supabase migration for `withdrawals` table

### Deliverable
User can withdraw earnings to their bank account. Withdrawal history is tracked. Failed transfers are automatically refunded.

---

## Decisions Confirmed

1. **Platform earnings model** — `service_fee` + `rounding_fee` + `booking_fee` (flat fees per ride, admin-configurable via `ride_fare_config`). No percentage cut. Driver gets `driverFare` = billing_unit × distance.
2. **Withdrawal fee** — passed to the user (deducted from withdrawal amount)
3. **Minimum withdrawal** — ₦1,000
4. **Withdrawal schedule** — instant (user can withdraw at any time; can be changed to weekly later)
5. **Vendor earnings** — in scope, same phases apply to food and marketplace vendors

## Phase Order Recommendation

Do Phase 1 first — it fixes a live bug where driver wallet earnings are lost on every wallet-paid ride completion. Phase 2 and 3 can follow together since bank account management is a prerequisite for withdrawal.
