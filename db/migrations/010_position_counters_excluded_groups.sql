ALTER TABLE position_counters
  ADD COLUMN excluded_source_group_jids json DEFAULT NULL AFTER excluded_pix_keys;
