const pool = require("../config/db");

const AMOUNT_DECIMAL_SQL = `
  CAST(
    CASE
      WHEN REPLACE(amount, ' ', '') REGEXP '^[0-9]{1,3}(,[0-9]{3})+\\.[0-9]+$'
        THEN REPLACE(REPLACE(amount, ' ', ''), ',', '')
      WHEN REPLACE(amount, ' ', '') REGEXP '^[0-9]{1,3}(\\.[0-9]{3})+,[0-9]+$'
        THEN REPLACE(REPLACE(REPLACE(amount, ' ', ''), '.', ''), ',', '.')
      WHEN REPLACE(amount, ' ', '') REGEXP '^[0-9]{1,3}(,[0-9]{3})+$'
        THEN REPLACE(REPLACE(amount, ' ', ''), ',', '')
      WHEN REPLACE(amount, ' ', '') REGEXP '^[0-9]{1,3}(\\.[0-9]{3})+$'
        THEN REPLACE(REPLACE(amount, ' ', ''), '.', '')
      WHEN REPLACE(amount, ' ', '') REGEXP '^[0-9]+,[0-9]+$'
        THEN REPLACE(REPLACE(amount, ' ', ''), ',', '.')
      ELSE REPLACE(amount, ' ', '')
    END AS DECIMAL(20, 2)
  )
`;

const ensureIndex = async (tableName, indexName, columnsSql) => {
  const [rows] = await pool.query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [tableName, indexName]
  );

  if (rows.length > 0) {
    return;
  }

  await pool.query(`ALTER TABLE ${tableName} ADD INDEX ${indexName} ${columnsSql}`);
};

const ensureRuntimeSchema = async () => {
  try {
    await pool.query(`
      ALTER TABLE abbreviations
      ADD COLUMN IF NOT EXISTS type varchar(20) NOT NULL DEFAULT 'text' AFTER response,
      ADD COLUMN IF NOT EXISTS media_path varchar(255) NULL AFTER type,
      ADD COLUMN IF NOT EXISTS media_mimetype varchar(100) NULL AFTER media_path,
      ADD COLUMN IF NOT EXISTS media_original_filename varchar(255) NULL AFTER media_mimetype,
      ADD COLUMN IF NOT EXISTS media_stored_filename varchar(255) NULL AFTER media_original_filename
    `);
    console.log("[SCHEMA] abbreviation media columns ensured.");

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
      CREATE TABLE IF NOT EXISTS invoice_position_counters (
        id int NOT NULL AUTO_INCREMENT,
        user_id int NOT NULL,
        subaccount_id int NOT NULL,
        name varchar(255) NOT NULL,
        excluded_cross_transaction_subaccount_ids longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(excluded_cross_transaction_subaccount_ids)),
        outs_source_subaccount_id int DEFAULT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY ux_ipc_subaccount (subaccount_id),
        KEY idx_ipc_user (user_id),
        KEY idx_ipc_outs_source_subaccount (outs_source_subaccount_id),
        CONSTRAINT fk_ipc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_ipc_subaccount FOREIGN KEY (subaccount_id) REFERENCES subaccounts (id) ON DELETE CASCADE,
        CONSTRAINT fk_ipc_outs_source_subaccount FOREIGN KEY (outs_source_subaccount_id) REFERENCES subaccounts (id) ON DELETE SET NULL
      )
    `);
    await pool.query(`
      ALTER TABLE invoice_position_counters
      ADD COLUMN IF NOT EXISTS excluded_cross_transaction_subaccount_ids longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(excluded_cross_transaction_subaccount_ids)) AFTER name
    `);
    await pool.query(`
      ALTER TABLE invoice_position_counters
      ADD COLUMN IF NOT EXISTS outs_source_subaccount_id int DEFAULT NULL AFTER excluded_cross_transaction_subaccount_ids
    `);
    console.log("[SCHEMA] invoice_position_counters ensured.");

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
      UPDATE xpayz_transactions xt
      JOIN subaccounts s ON s.subaccount_number = CAST(xt.subaccount_id AS CHAR)
      SET xt.display_subaccount_id = s.id
      WHERE xt.display_subaccount_id IS NULL OR xt.display_subaccount_id <> s.id
    `);
    await pool.query(`
      UPDATE trkbit_transactions tt
      JOIN subaccounts s ON s.chave_pix = tt.tx_pix_key
      SET tt.display_subaccount_id = s.id
      WHERE tt.display_subaccount_id IS NULL OR tt.display_subaccount_id <> s.id
    `);
    console.log("[SCHEMA] statement display_subaccount_id backfill ensured.");

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
      ADD COLUMN IF NOT EXISTS is_portal_confirmed tinyint(1) NOT NULL DEFAULT 1 AFTER linked_transaction_source,
      ADD COLUMN IF NOT EXISTS amount_decimal decimal(20,2) NOT NULL DEFAULT 0.00 AFTER amount
    `);
    await pool.query(`
      UPDATE invoices
      SET amount_decimal = ${AMOUNT_DECIMAL_SQL}
      WHERE amount_decimal = 0.00
         OR amount_decimal IS NULL
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subaccount_invoice_manual_entries (
        id int NOT NULL AUTO_INCREMENT,
        subaccount_id int NOT NULL,
        direction enum('in','out') NOT NULL DEFAULT 'in',
        starting_scope enum('geral','chave_pix','all') NOT NULL DEFAULT 'geral',
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
      ADD COLUMN IF NOT EXISTS starting_scope enum('geral','chave_pix','all') NOT NULL DEFAULT 'geral' AFTER direction
    `);
    await pool.query(`
      ALTER TABLE subaccount_invoice_manual_entries
      MODIFY COLUMN starting_scope enum('geral','chave_pix','all') NOT NULL DEFAULT 'geral'
    `);

    await ensureIndex('invoices', 'idx_invoices_deleted_received', '(is_deleted, received_at, id)');
    await ensureIndex('invoices', 'idx_invoices_recipient_deleted_received', '(recipient_name, is_deleted, received_at, id)');
    await ensureIndex('invoices', 'idx_invoices_group_deleted_received', '(source_group_jid, is_deleted, received_at, id)');
    await ensureIndex('invoices', 'idx_invoices_transaction_amount_decimal', '(transaction_id, amount_decimal)');
    await ensureIndex('invoices', 'idx_invoices_amount_decimal_received', '(amount_decimal, received_at, id)');
    await ensureIndex('subaccounts', 'idx_subaccounts_number', '(subaccount_number)');
    await ensureIndex('subaccounts', 'idx_subaccounts_pix', '(chave_pix)');
    await ensureIndex('subaccounts', 'idx_subaccounts_group', '(assigned_group_jid)');
    await ensureIndex('xpayz_transactions', 'idx_xt_subaccount_date', '(subaccount_id, transaction_date, id)');
    await ensureIndex('xpayz_transactions', 'idx_xt_display_date', '(display_subaccount_id, transaction_date, id)');
    await ensureIndex('xpayz_transactions', 'idx_xt_direction_date', '(operation_direct, transaction_date, id)');
    await ensureIndex('trkbit_transactions', 'idx_tt_pix_date', '(tx_pix_key, tx_date, uid)');
    await ensureIndex('trkbit_transactions', 'idx_tt_display_date', '(display_subaccount_id, tx_date, uid)');
    await ensureIndex('trkbit_transactions', 'idx_tt_type_date', '(tx_type, tx_date, uid)');
    await ensureIndex('subaccount_manual_transactions', 'idx_smt_subaccount_direction_date', '(subaccount_id, direction, transaction_date, id)');
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

