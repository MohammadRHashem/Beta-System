CREATE TABLE IF NOT EXISTS subaccount_manual_transactions (
  id int NOT NULL AUTO_INCREMENT,
  subaccount_id int NOT NULL,
  direction enum('in','out') NOT NULL DEFAULT 'in',
  sender_name varchar(255) DEFAULT NULL,
  counterparty_name varchar(255) DEFAULT NULL,
  amount decimal(20,2) NOT NULL DEFAULT '0.00',
  transaction_date datetime NOT NULL,
  is_portal_confirmed tinyint(1) NOT NULL DEFAULT '0',
  portal_notes varchar(30) DEFAULT NULL,
  badge_label varchar(50) DEFAULT NULL,
  visible_in_master tinyint(1) NOT NULL DEFAULT '1',
  visible_in_view_only tinyint(1) NOT NULL DEFAULT '1',
  created_by_user_id int DEFAULT NULL,
  updated_by_user_id int DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_smt_subaccount_date (subaccount_id, transaction_date),
  KEY idx_smt_visibility (visible_in_master, visible_in_view_only),
  CONSTRAINT fk_smt_subaccount FOREIGN KEY (subaccount_id) REFERENCES subaccounts (id) ON DELETE CASCADE,
  CONSTRAINT fk_smt_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_smt_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE xpayz_transactions
  ADD COLUMN IF NOT EXISTS display_subaccount_id int NULL AFTER subaccount_id,
  ADD COLUMN IF NOT EXISTS entry_origin enum('synced','statement_manual','moved') NOT NULL DEFAULT 'synced' AFTER display_subaccount_id,
  ADD COLUMN IF NOT EXISTS sync_control_state enum('normal','blocked','hidden') NOT NULL DEFAULT 'normal' AFTER entry_origin,
  ADD COLUMN IF NOT EXISTS badge_label varchar(50) NULL AFTER sync_control_state,
  ADD COLUMN IF NOT EXISTS visible_in_master tinyint(1) NOT NULL DEFAULT '1' AFTER badge_label,
  ADD COLUMN IF NOT EXISTS visible_in_view_only tinyint(1) NOT NULL DEFAULT '1' AFTER visible_in_master,
  ADD COLUMN IF NOT EXISTS updated_by_user_id int NULL AFTER visible_in_view_only;

ALTER TABLE trkbit_transactions
  ADD COLUMN IF NOT EXISTS display_subaccount_id int NULL AFTER tx_pix_key,
  ADD COLUMN IF NOT EXISTS entry_origin enum('synced','statement_manual','moved') NOT NULL DEFAULT 'synced' AFTER display_subaccount_id,
  ADD COLUMN IF NOT EXISTS sync_control_state enum('normal','blocked','hidden') NOT NULL DEFAULT 'normal' AFTER entry_origin,
  ADD COLUMN IF NOT EXISTS badge_label varchar(50) NULL AFTER sync_control_state,
  ADD COLUMN IF NOT EXISTS visible_in_master tinyint(1) NOT NULL DEFAULT '1' AFTER badge_label,
  ADD COLUMN IF NOT EXISTS visible_in_view_only tinyint(1) NOT NULL DEFAULT '1' AFTER visible_in_master,
  ADD COLUMN IF NOT EXISTS updated_by_user_id int NULL AFTER visible_in_view_only;

ALTER TABLE xpayz_transactions
  ADD KEY IF NOT EXISTS idx_xpayz_display_subaccount_id (display_subaccount_id),
  ADD KEY IF NOT EXISTS idx_xpayz_sync_control_state (sync_control_state),
  ADD KEY IF NOT EXISTS idx_xpayz_entry_origin (entry_origin),
  ADD KEY IF NOT EXISTS idx_xpayz_visibility (visible_in_master, visible_in_view_only);

ALTER TABLE trkbit_transactions
  ADD KEY IF NOT EXISTS idx_trkbit_display_subaccount_id (display_subaccount_id),
  ADD KEY IF NOT EXISTS idx_trkbit_sync_control_state (sync_control_state),
  ADD KEY IF NOT EXISTS idx_trkbit_entry_origin (entry_origin),
  ADD KEY IF NOT EXISTS idx_trkbit_visibility (visible_in_master, visible_in_view_only);
