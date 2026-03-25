const pool = require("../config/db");

const ensureRuntimeSchema = async () => {
  try {
    await pool.query(`
      ALTER TABLE request_types
      ADD COLUMN IF NOT EXISTS new_content_reaction VARCHAR(16) NULL AFTER acknowledgement_reaction,
      ADD COLUMN IF NOT EXISTS new_content_reply_text VARCHAR(255) NULL AFTER new_content_reaction
    `);
    console.log(
      "[SCHEMA] request_types columns ensured: new_content_reaction, new_content_reply_text.",
    );

    await pool.query(`
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
        KEY idx_smt_visibility (visible_in_master, visible_in_view_only)
      )
    `);
    console.log("[SCHEMA] subaccount_manual_transactions ensured.");

    await pool.query(`
      ALTER TABLE xpayz_transactions
      ADD COLUMN IF NOT EXISTS display_subaccount_id int NULL AFTER subaccount_id,
      ADD COLUMN IF NOT EXISTS entry_origin enum('synced','statement_manual','moved') NOT NULL DEFAULT 'synced' AFTER display_subaccount_id,
      ADD COLUMN IF NOT EXISTS sync_control_state enum('normal','blocked','hidden') NOT NULL DEFAULT 'normal' AFTER entry_origin,
      ADD COLUMN IF NOT EXISTS badge_label varchar(50) NULL AFTER sync_control_state,
      ADD COLUMN IF NOT EXISTS visible_in_master tinyint(1) NOT NULL DEFAULT '1' AFTER badge_label,
      ADD COLUMN IF NOT EXISTS visible_in_view_only tinyint(1) NOT NULL DEFAULT '1' AFTER visible_in_master,
      ADD COLUMN IF NOT EXISTS updated_by_user_id int NULL AFTER visible_in_view_only
    `);
    await pool.query(`
      ALTER TABLE trkbit_transactions
      ADD COLUMN IF NOT EXISTS display_subaccount_id int NULL AFTER tx_pix_key,
      ADD COLUMN IF NOT EXISTS entry_origin enum('synced','statement_manual','moved') NOT NULL DEFAULT 'synced' AFTER display_subaccount_id,
      ADD COLUMN IF NOT EXISTS sync_control_state enum('normal','blocked','hidden') NOT NULL DEFAULT 'normal' AFTER entry_origin,
      ADD COLUMN IF NOT EXISTS badge_label varchar(50) NULL AFTER sync_control_state,
      ADD COLUMN IF NOT EXISTS visible_in_master tinyint(1) NOT NULL DEFAULT '1' AFTER badge_label,
      ADD COLUMN IF NOT EXISTS visible_in_view_only tinyint(1) NOT NULL DEFAULT '1' AFTER visible_in_master,
      ADD COLUMN IF NOT EXISTS updated_by_user_id int NULL AFTER visible_in_view_only
    `);
    console.log("[SCHEMA] statement transaction control columns ensured.");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS subaccount_profile_entries (
        id int NOT NULL AUTO_INCREMENT,
        subaccount_id int NOT NULL,
        label varchar(120) DEFAULT NULL,
        account_holder_name varchar(255) NOT NULL,
        institution_name varchar(255) NOT NULL,
        pix_key varchar(255) NOT NULL,
        pix_copy_code text DEFAULT NULL,
        sort_order int NOT NULL DEFAULT 0,
        is_active tinyint(1) NOT NULL DEFAULT 1,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_spe_subaccount_sort (subaccount_id, is_active, sort_order, id)
      )
    `);
    console.log("[SCHEMA] subaccount_profile_entries ensured.");

    await pool.query(`
      ALTER TABLE subaccounts
      ADD COLUMN IF NOT EXISTS portal_source_type enum('transactions','invoices') NOT NULL DEFAULT 'transactions' AFTER account_type,
      ADD COLUMN IF NOT EXISTS invoice_recipient_pattern varchar(255) NULL AFTER assigned_group_name
    `);
    await pool.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS is_portal_confirmed tinyint(1) NOT NULL DEFAULT 1 AFTER linked_transaction_source
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subaccount_invoice_manual_entries (
        id int NOT NULL AUTO_INCREMENT,
        subaccount_id int NOT NULL,
        direction enum('in','out') NOT NULL DEFAULT 'in',
        starting_scope enum('geral','chave_pix') NOT NULL DEFAULT 'geral',
        sender_name varchar(255) DEFAULT NULL,
        counterparty_name varchar(255) DEFAULT NULL,
        amount decimal(20,2) NOT NULL DEFAULT '0.00',
        transaction_date datetime NOT NULL,
        is_portal_confirmed tinyint(1) NOT NULL DEFAULT 1,
        portal_notes text DEFAULT NULL,
        is_starting_entry tinyint(1) NOT NULL DEFAULT 0,
        created_by_user_id int DEFAULT NULL,
        updated_by_user_id int DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_sime_subaccount_date (subaccount_id, transaction_date),
        KEY idx_sime_start (subaccount_id, starting_scope, is_starting_entry, transaction_date)
      )
    `);
    await pool.query(`
      ALTER TABLE subaccount_invoice_manual_entries
      ADD COLUMN IF NOT EXISTS starting_scope enum('geral','chave_pix') NOT NULL DEFAULT 'geral' AFTER direction
    `);
    console.log("[SCHEMA] invoice portal columns and subaccount_invoice_manual_entries ensured.");
  } catch (error) {
    console.error(
      "[SCHEMA] Failed runtime schema ensure:",
      error.message,
    );
    throw error;
  }
};

module.exports = {
  ensureRuntimeSchema,
};

