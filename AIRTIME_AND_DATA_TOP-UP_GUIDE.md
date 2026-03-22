# AIRTIME AND DATA TOP-UP IMPLEMENTATION GUIDE

**Service:** platform-service  
**Status:** Implementation Planning  
**Flutterwave API:** Bills Payment API v3

---

## OVERVIEW

Implement airtime and data bundle purchase functionality using Flutterwave Bills Payment API. Users can purchase airtime or data bundles for any Nigerian network (MTN, GLO, Airtel, 9Mobile) and pay using wallet balance or saved cards.

---

## UI FLOW ANALYSIS

**Screen 1: Airtime/Data Selection**
- Toggle between Airtime and Data tabs
- Phone number input with network detection
- Quick amount buttons (₦50, ₦100, ₦200, ₦300, ₦400, ₦500)
- Custom amount input (₦50 - ₦500,000)
- For Data: Weekly/Monthly/3-Monthly tabs with bundle options

**Screen 2: Network Selection**
- Choose network: GLO, Airtel, 9Mobile, MTN
- Auto-detect from phone number

**Screen 3: Payment Method**
- Wallet (with balance display)
- Card (saved cards)
- Radio button selection

**Screen 4: Transaction Summary**
- Amount, Product Name, Payment Method
- Confirm purchase

**Screen 5: Success**
- Success message with checkmark
- Transaction details
- Go to Home button

---

## TECHNICAL REQUIREMENTS

### Flutterwave Bills Payment API

**Base URL:** `https://api.flutterwave.com/v3`

**Key Endpoints:**
1. `GET /bill-categories` - Get all bill categories (airtime, data, etc.)
2. `GET /bill-categories/:category_id/billers` - Get billers (networks)
3. `GET /billers/:biller_code/items` - Get data bundles for network
4. `POST /bills` - Purchase airtime or data
5. `GET /bills/:reference` - Verify transaction

**Authentication:**
- Header: `Authorization: Bearer SECRET_KEY`

---

## DATABASE SCHEMA

### bill_transactions
```sql
CREATE TABLE bill_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  transaction_type VARCHAR(20) NOT NULL, -- 'airtime', 'data'
  network VARCHAR(20) NOT NULL, -- 'MTN', 'GLO', 'Airtel', '9Mobile'
  phone_number VARCHAR(20) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency_code VARCHAR(3) DEFAULT 'NGN',
  
  -- Data bundle specific
  bundle_code VARCHAR(50), -- For data bundles
  bundle_name VARCHAR(100),
  bundle_validity VARCHAR(50), -- '7 days', '30 days', etc.
  
  -- Payment details
  payment_method VARCHAR(20) NOT NULL, -- 'wallet', 'card'
  payment_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  
  -- Flutterwave details
  flw_reference VARCHAR(100) UNIQUE,
  flw_tx_ref VARCHAR(100) UNIQUE,
  flw_biller_code VARCHAR(50),
  flw_item_code VARCHAR(50),
  flw_response JSON DEFAULT '{}',
  
  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'refunded'
  error_message TEXT,
  
  -- Wallet transaction reference (if paid with wallet)
  wallet_transaction_id UUID,
  
  -- Timestamps
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bill_transactions_user_id ON bill_transactions(user_id);
CREATE INDEX idx_bill_transactions_status ON bill_transactions(status);
CREATE INDEX idx_bill_transactions_type ON bill_transactions(transaction_type);
CREATE INDEX idx_bill_transactions_flw_ref ON bill_transactions(flw_reference);
CREATE INDEX idx_bill_transactions_created_at ON bill_transactions(created_at DESC);
```

### network_providers
```sql
CREATE TABLE network_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL, -- 'MTN', 'GLO', 'Airtel', '9Mobile'
  code VARCHAR(20) NOT NULL UNIQUE, -- 'mtn', 'glo', 'airtel', '9mobile'
  flw_biller_code VARCHAR(50) NOT NULL, -- Flutterwave biller code
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  supports_airtime BOOLEAN DEFAULT true,
  supports_data BOOLEAN DEFAULT true,
  metadata JSON DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_network_providers_code ON network_providers(code);
CREATE INDEX idx_network_providers_active ON network_providers(is_active);
```

### data_bundles (Cache)
```sql
CREATE TABLE data_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_code VARCHAR(20) NOT NULL,
  bundle_code VARCHAR(50) NOT NULL,
  bundle_name VARCHAR(100) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  validity VARCHAR(50), -- '7 days', '30 days', '90 days'
  validity_type VARCHAR(20), -- 'weekly', 'monthly', '3-monthly'
  data_size VARCHAR(50), -- '100MB', '1GB', etc.
  flw_item_code VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  
  -- Cache management
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_data_bundles_network ON data_bundles(network_code);
CREATE INDEX idx_data_bundles_validity_type ON data_bundles(validity_type);
CREATE INDEX idx_data_bundles_active ON data_bundles(is_active);
CREATE UNIQUE INDEX idx_data_bundles_network_code ON data_bundles(network_code, bundle_code);
```

---

## IMPLEMENTATION PHASES

### PHASE 1: FOUNDATION & AIRTIME PURCHASE

**Goal:** Users can purchase airtime using wallet or card

**Database:**
1. Create migration for `bill_transactions`, `network_providers`, `data_bundles` tables
2. Seed `network_providers` with Nigerian networks

**Services:**
1. `FlutterwaveBillsService` - Flutterwave Bills API integration
   - `getBillers()` - Get available networks
   - `purchaseAirtime()` - Purchase airtime
   - `verifyTransaction()` - Verify bill payment
   
2. `BillsService` - Business logic
   - `getNetworks()` - Get available networks
   - `purchaseAirtime()` - Handle airtime purchase with wallet/card
   - `getTransactionHistory()` - Get user's bills history
   - `getTransaction()` - Get specific transaction

3. `WalletIntegrationService` - Communicate with core-logistics wallet
   - `getWalletBalance()` - Get user wallet balance
   - `deductFromWallet()` - Deduct amount from wallet

**Controllers:**
1. `BillsController`
   - `getNetworks()` - GET /api/bills/networks
   - `purchaseAirtime()` - POST /api/bills/airtime/purchase
   - `getTransactionHistory()` - GET /api/bills/transactions
   - `getTransaction()` - GET /api/bills/transaction/:id

**Routes:**
- `bills.routes.ts` - All bills endpoints

**Environment Variables:**
```env
# Flutterwave Bills Payment
FLUTTERWAVE_PUBLIC_KEY=your_public_key
FLUTTERWAVE_SECRET_KEY=your_secret_key
FLUTTERWAVE_ENCRYPTION_KEY=your_encryption_key
FLUTTERWAVE_BASE_URL=https://api.flutterwave.com/v3

# Core Logistics Service (for wallet)
CORE_LOGISTICS_URL=http://localhost:3001
CORE_LOGISTICS_INTERNAL_API_KEY=your_internal_key
```

**Payment Flow (Airtime):**
1. User enters phone number and amount
2. Frontend detects network from phone number
3. User selects payment method (wallet/card)
4. Backend validates amount (₦50 - ₦500,000)
5. If wallet: Check balance, deduct amount
6. If card: Charge card via Flutterwave
7. Call Flutterwave Bills API to purchase airtime
8. Store transaction in database
9. Return success/failure response

**APIs Created (Phase 1):**
- GET `/api/bills/networks` - Get available networks
- POST `/api/bills/airtime/purchase` - Purchase airtime
- GET `/api/bills/transactions` - Get transaction history
- GET `/api/bills/transaction/:id` - Get transaction details

---

### PHASE 2: DATA BUNDLES & CACHING

**Goal:** Users can purchase data bundles with cached bundle options

**Services:**
1. Update `FlutterwaveBillsService`
   - `getDataBundles()` - Fetch data bundles from Flutterwave
   - `purchaseData()` - Purchase data bundle

2. Update `BillsService`
   - `getDataBundles()` - Get cached data bundles (with refresh logic)
   - `purchaseData()` - Handle data purchase
   - `refreshDataBundlesCache()` - Refresh cache from Flutterwave

3. `DataBundleCacheService` - Manage data bundle caching
   - `getCachedBundles()` - Get from database
   - `syncBundles()` - Sync with Flutterwave API
   - `shouldRefresh()` - Check if cache needs refresh (24hrs)

**Controllers:**
1. Update `BillsController`
   - `getDataBundles()` - GET /api/bills/data-bundles/:network
   - `purchaseData()` - POST /api/bills/data/purchase
   - `refreshDataCache()` - POST /api/bills/data-bundles/refresh (admin)

**Caching Strategy:**
- Cache data bundles in database
- Auto-refresh every 24 hours
- Manual refresh endpoint for admin
- On-demand refresh if cache is empty

**Payment Flow (Data):**
1. User selects network
2. Frontend fetches data bundles for network
3. User selects bundle and payment method
4. Backend validates bundle availability
5. If wallet: Check balance, deduct amount
6. If card: Charge card via Flutterwave
7. Call Flutterwave Bills API to purchase data
8. Store transaction in database
9. Return success/failure response

**APIs Created (Phase 2):**
- GET `/api/bills/data-bundles/:network` - Get data bundles for network
- POST `/api/bills/data/purchase` - Purchase data bundle
- POST `/api/bills/data-bundles/refresh` - Refresh cache (admin)

---

### PHASE 3: GATEWAY INTEGRATION & POLISH

**Goal:** Complete integration with gateway and production-ready features

**Gateway:**
1. Add `/api/bills/*` routes to gateway
2. Configure authentication middleware
3. Add rate limiting for bills endpoints

**Features:**
1. Transaction status webhooks (Flutterwave callback)
2. Failed transaction retry logic
3. Refund handling for failed purchases
4. Transaction receipt generation
5. Push notifications for transaction status
6. Analytics and reporting

**Services:**
1. `BillsWebhookService` - Handle Flutterwave webhooks
   - `handleWebhook()` - Process webhook events
   - `verifyWebhookSignature()` - Validate webhook

2. Update `BillsService`
   - `retryFailedTransaction()` - Retry failed purchase
   - `refundTransaction()` - Process refund
   - `getTransactionReceipt()` - Generate receipt

**Controllers:**
1. Update `BillsController`
   - `handleWebhook()` - POST /api/bills/webhook (public)
   - `retryTransaction()` - POST /api/bills/transaction/:id/retry
   - `getReceipt()` - GET /api/bills/transaction/:id/receipt

**Monitoring:**
- Log all Flutterwave API calls
- Track success/failure rates
- Monitor transaction processing times
- Alert on high failure rates

**Testing:**
- Unit tests for all services
- Integration tests for Flutterwave API
- End-to-end tests for purchase flows
- Load testing for concurrent purchases



**APIs Created (Phase 3):**
- POST `/api/bills/webhook` - Flutterwave webhook handler
- POST `/api/bills/transaction/:id/retry` - Retry failed transaction
- GET `/api/bills/transaction/:id/receipt` - Get transaction receipt

---

## API ENDPOINTS SUMMARY

### Customer Endpoints

**1. GET /api/bills/networks**
```typescript
Response: {
  success: true,
  data: {
    networks: [
      {
        id: "uuid",
        name: "MTN",
        code: "mtn",
        logo_url: "https://...",
        supports_airtime: true,
        supports_data: true
      },
      // ... other networks
    ]
  }
}
```

**2. GET /api/bills/data-bundles/:network**
```typescript
Query: ?validity_type=monthly (optional: weekly, monthly, 3-monthly)

Response: {
  success: true,
  data: {
    network: "MTN",
    bundles: [
      {
        id: "uuid",
        bundle_code: "mtn-100mb-7days",
        bundle_name: "100MB - 7 Days",
        amount: 100,
        data_size: "100MB",
        validity: "7 days",
        validity_type: "weekly"
      },
      // ... other bundles
    ],
    last_synced_at: "2026-03-10T10:00:00Z"
  }
}it
```

**3. POST /api/bills/airtime/purchase**
```typescript
Request: {
  phone_number: "08012345678",
  network: "mtn", // or auto-detect from phone
  amount: 500,
  payment_method: "wallet" | "card",
  card_id?: "uuid" // if payment_method is card
}

Response: {
  success: true,
  data: {
    transaction: {
      id: "uuid",
      transaction_type: "airtime",
      network: "MTN",
      phone_number: "08012345678",
      amount: 500,
      status: "completed",
      flw_reference: "FLW-REF-123",
      created_at: "2026-03-10T10:00:00Z"
    },
    message: "Airtime purchase successful"
  }
}
```

**4. POST /api/bills/data/purchase**
```typescript
Request: {
  phone_number: "08012345678",
  network: "mtn",
  bundle_code: "mtn-1gb-30days",
  payment_method: "wallet" | "card",
  card_id?: "uuid"
}

Response: {
  success: true,
  data: {
    transaction: {
      id: "uuid",
      transaction_type: "data",
      network: "MTN",
      phone_number: "08012345678",
      bundle_name: "1GB - 30 Days",
      amount: 1000,
      status: "completed",
      flw_reference: "FLW-REF-124",
      created_at: "2026-03-10T10:00:00Z"
    },
    message: "Data bundle purchase successful"
  }
}
```

**5. GET /api/bills/transactions**
```typescript
Query: ?page=1&limit=10&type=airtime|data

Response: {
  success: true,
  data: {
    transactions: [
      {
        id: "uuid",
        transaction_type: "airtime",
        network: "MTN",
        phone_number: "08012345678",
        amount: 500,
        status: "completed",
        payment_method: "wallet",
        created_at: "2026-03-10T10:00:00Z"
      },
      // ... more transactions
    ],
    pagination: {
      page: 1,
      limit: 10,
      total: 50,
      total_pages: 5
    }
  }
}
```

**6. GET /api/bills/transaction/:id**
```typescript
Response: {
  success: true,
  data: {
    transaction: {
      id: "uuid",
      transaction_type: "data",
      network: "MTN",
      phone_number: "08012345678",
      amount: 1000,
      bundle_name: "1GB - 30 Days",
      bundle_validity: "30 days",
      payment_method: "wallet",
      payment_status: "completed",
      status: "completed",
      flw_reference: "FLW-REF-124",
      completed_at: "2026-03-10T10:00:00Z",
      created_at: "2026-03-10T10:00:00Z"
    }
  }
}
```

---

## FLUTTERWAVE BILLS API INTEGRATION

### Network Codes (Biller Codes)
```typescript
const NETWORK_BILLERS = {
  MTN: 'BIL099',      // MTN Nigeria
  GLO: 'BIL100',      // Glo Nigeria
  AIRTEL: 'BIL102',   // Airtel Nigeria
  '9MOBILE': 'BIL103' // 9Mobile Nigeria
};
```

### Purchase Airtime Example
```typescript
POST https://api.flutterwave.com/v3/bills
Headers: {
  Authorization: Bearer SECRET_KEY
}
Body: {
  country: "NG",
  customer: "08012345678",
  amount: 500,
  type: "AIRTIME",
  reference: "olakz_airtime_1234567890",
  recurrence: "ONCE"
}
```

### Purchase Data Example
```typescript
POST https://api.flutterwave.com/v3/bills
Headers: {
  Authorization: Bearer SECRET_KEY
}
Body: {
  country: "NG",
  customer: "08012345678",
  amount: 1000,
  type: "DATA_BUNDLE",
  reference: "olakz_data_1234567890",
  biller_code: "BIL099", // MTN
  item_code: "MT100", // 1GB bundle code
  recurrence: "ONCE"
}
```

---

## ERROR HANDLING

### Common Errors
1. Insufficient wallet balance
2. Invalid phone number
3. Network unavailable
4. Flutterwave API error
5. Payment failed
6. Bundle not available

### Error Response Format
```typescript
{
  success: false,
  error: {
    code: "INSUFFICIENT_BALANCE",
    message: "Insufficient wallet balance",
    details: {
      required: 500,
      available: 300
    }
  }
}
```

---

## TESTING CHECKLIST

### Phase 1
- [ ] Create database migration
- [ ] Seed network providers
- [ ] Implement FlutterwaveBillsService
- [ ] Implement BillsService
- [ ] Implement WalletIntegrationService
- [ ] Create BillsController
- [ ] Create bills routes
- [ ] Test airtime purchase with wallet
- [ ] Test airtime purchase with card
- [ ] Test transaction history
- [ ] Add to gateway

### Phase 2
- [ ] Implement data bundle caching
- [ ] Sync data bundles from Flutterwave
- [ ] Implement data purchase flow
- [ ] Test cache refresh (24hrs)
- [ ] Test on-demand cache refresh
- [ ] Test data purchase with wallet
- [ ] Test data purchase with card
- [ ] Filter bundles by validity type

### Phase 3
- [ ] Implement webhook handler
- [ ] Implement retry logic
- [ ] Implement refund handling
- [ ] Generate transaction receipts
- [ ] Add push notifications
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Load testing
- [ ] Production deployment

---

## SECURITY CONSIDERATIONS

1. Validate phone numbers (Nigerian format)
2. Rate limit purchase endpoints (max 5 per minute per user)
3. Verify Flutterwave webhook signatures
4. Encrypt sensitive transaction data
5. Log all API calls for audit
6. Implement idempotency for purchases (prevent duplicate)
7. Validate amount limits (₦50 - ₦500,000)
8. Secure internal API calls to core-logistics

---

## MONITORING & ANALYTICS

### Metrics to Track
- Total airtime purchases (daily/weekly/monthly)
- Total data purchases (daily/weekly/monthly)
- Revenue by network
- Success/failure rates
- Average transaction time
- Popular data bundles
- Payment method distribution (wallet vs card)
- Failed transaction reasons

### Alerts
- High failure rate (>10%)
- Flutterwave API downtime
- Wallet service unavailable
- Cache sync failures

---

## NEXT STEPS

1. Review and approve this implementation plan
2. Set up Flutterwave Bills Payment API access
3. Begin Phase 1 implementation
4. Test with Flutterwave test environment
5. Deploy to staging
6. Production deployment after testing

---

**TOTAL ENDPOINTS: 6 Customer APIs + 2 Admin APIs = 8 APIs**

**ESTIMATED TIMELINE:**
- Phase 1: 3-4 days
- Phase 2: 2-3 days
- Phase 3: 2-3 days
- Total: 7-10 days

Ready to start implementation!
