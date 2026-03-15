-- Add separate data biller code to network_providers
-- Airtime and data use different biller codes in Flutterwave

ALTER TABLE network_providers
  ADD COLUMN IF NOT EXISTS flw_data_biller_code VARCHAR(50);

-- Update with verified Flutterwave data biller codes
-- Airtime: BIL099 (MTN), BIL102 (GLO), BIL100 (Airtel), BIL103 (9Mobile)
-- Data:    BIL104 (MTN), BIL105 (GLO), BIL106 (Airtel), BIL107 (9Mobile)
UPDATE network_providers SET flw_data_biller_code = 'BIL104' WHERE code = 'mtn';
UPDATE network_providers SET flw_data_biller_code = 'BIL105' WHERE code = 'glo';
UPDATE network_providers SET flw_data_biller_code = 'BIL106' WHERE code = 'airtel';
UPDATE network_providers SET flw_data_biller_code = 'BIL107' WHERE code = '9mobile';
