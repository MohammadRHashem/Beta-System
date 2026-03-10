ALTER TABLE group_settings
  ADD COLUMN IF NOT EXISTS confirmation_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER archiving_enabled;
