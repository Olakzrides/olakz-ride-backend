-- ================================================================
-- Daily Transaction Audit Sheet
-- Tables live in admin-service migrations (not root)
-- ================================================================

-- ----------------------------------------------------------------
-- 1. audit_transactions
--    One row per completed transaction entered by admin.
--    audit_date is always set by the backend — never from client.
--    profit and loss are always calculated by the backend.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  serial_number        INT  NOT NULL,              -- auto-incremented per date
  service_type         VARCHAR(30) NOT NULL,        -- rides|deliveries|food_orders|marketplace|airtime_data
  ride_type            VARCHAR(20),                 -- car|bus|minibus|bicycle|motorcycle|truck (rides only)
  charge_price         DECIMAL(12, 2) NOT NULL,     -- CP: expected collection amount
  amount_paid          DECIMAL(12, 2) NOT NULL,     -- AP: actual amount received
  profit               DECIMAL(12, 2) NOT NULL DEFAULT 0,  -- backend calculated
  loss                 DECIMAL(12, 2) NOT NULL DEFAULT 0,  -- backend calculated
  pickup_time          TIME,
  dropoff_time         TIME,
  sender_phone         VARCHAR(20),
  receiver_phone       VARCHAR(20),
  rider_phone          VARCHAR(20),
  pickup_address       TEXT,
  destination          TEXT,
  staff_on_duty        VARCHAR(100),
  transaction_expenses DECIMAL(12, 2) NOT NULL DEFAULT 0,
  is_locked            BOOLEAN NOT NULL DEFAULT false,
  created_by           UUID NOT NULL,               -- admin user id
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT audit_transactions_service_type_check
    CHECK (service_type IN ('rides', 'deliveries', 'food_orders', 'marketplace', 'airtime_data')),

  CONSTRAINT audit_transactions_ride_type_check
    CHECK (
      (service_type = 'rides' AND ride_type IS NOT NULL) OR
      (service_type <> 'rides' AND ride_type IS NULL)
    ),

  CONSTRAINT audit_transactions_ride_type_values_check
    CHECK (ride_type IS NULL OR ride_type IN ('car', 'bus', 'minibus', 'bicycle', 'motorcycle', 'truck')),

  CONSTRAINT audit_transactions_cp_positive CHECK (charge_price > 0),
  CONSTRAINT audit_transactions_ap_non_negative CHECK (amount_paid >= 0)
  -- Note: AP (Actual Payout) CAN exceed CP (Charge Price) — that is a loss scenario.
  -- No upper bound constraint on amount_paid.
);

-- Unique serial number per date
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_transactions_date_serial
  ON audit_transactions(audit_date, serial_number);

CREATE INDEX IF NOT EXISTS idx_audit_transactions_date      ON audit_transactions(audit_date);
CREATE INDEX IF NOT EXISTS idx_audit_transactions_locked    ON audit_transactions(is_locked);
CREATE INDEX IF NOT EXISTS idx_audit_transactions_created_by ON audit_transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_audit_transactions_service   ON audit_transactions(service_type);

-- ----------------------------------------------------------------
-- 2. audit_expenditures
--    Daily operational expenditures — not tied to a transaction.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_expenditures (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  expenditure_amount      DECIMAL(12, 2) NOT NULL,
  expenditure_reason      VARCHAR(100) NOT NULL,    -- Fuel|Discount|Repairs|Data Subscription|Other
  expenditure_description TEXT,
  is_locked               BOOLEAN NOT NULL DEFAULT false,
  created_by              UUID NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT audit_expenditures_amount_positive CHECK (expenditure_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_audit_expenditures_date      ON audit_expenditures(audit_date);
CREATE INDEX IF NOT EXISTS idx_audit_expenditures_locked    ON audit_expenditures(is_locked);
CREATE INDEX IF NOT EXISTS idx_audit_expenditures_created_by ON audit_expenditures(created_by);

-- ----------------------------------------------------------------
-- 3. auto-update updated_at
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_transactions_updated_at ON audit_transactions;
CREATE TRIGGER trg_audit_transactions_updated_at
  BEFORE UPDATE ON audit_transactions
  FOR EACH ROW EXECUTE FUNCTION update_audit_updated_at();
