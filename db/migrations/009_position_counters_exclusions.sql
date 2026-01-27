ALTER TABLE position_counters
  ADD COLUMN excluded_pix_keys json DEFAULT NULL AFTER subaccount_id;
