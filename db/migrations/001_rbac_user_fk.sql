-- Migration 001: Move FK references from old_users_backup to users
-- Target: MySQL 8.x
-- Notes:
-- - This migration matches users by username.
-- - Verify data and run on a backup first.

SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

START TRANSACTION;

-- 1) Ensure every old user exists in users (match by username).
INSERT INTO users (username, password_hash, role_id, is_active, created_at, token_version)
SELECT ob.username, ob.password_hash, NULL, 1, ob.created_at, 1
FROM old_users_backup ob
LEFT JOIN users u ON u.username = ob.username
WHERE u.id IS NULL;

-- 2) Build old->new user id map (by username).
CREATE TEMPORARY TABLE tmp_user_map (
  old_id INT PRIMARY KEY,
  new_id INT NOT NULL
);

INSERT INTO tmp_user_map (old_id, new_id)
SELECT ob.id, u.id
FROM old_users_backup ob
JOIN users u ON u.username = ob.username;

-- 3) Repoint user_id columns to users.id
UPDATE abbreviations a
JOIN tmp_user_map m ON a.user_id = m.old_id
SET a.user_id = m.new_id;

UPDATE broadcast_uploads bu
JOIN tmp_user_map m ON bu.user_id = m.old_id
SET bu.user_id = m.new_id;

UPDATE chave_pix_keys cpk
JOIN tmp_user_map m ON cpk.user_id = m.old_id
SET cpk.user_id = m.new_id;

UPDATE direct_forwarding_rules dfr
JOIN tmp_user_map m ON dfr.user_id = m.old_id
SET dfr.user_id = m.new_id;

UPDATE forwarding_rules fr
JOIN tmp_user_map m ON fr.user_id = m.old_id
SET fr.user_id = m.new_id;

UPDATE group_batches gb
JOIN tmp_user_map m ON gb.user_id = m.old_id
SET gb.user_id = m.new_id;

UPDATE message_templates mt
JOIN tmp_user_map m ON mt.user_id = m.old_id
SET mt.user_id = m.new_id;

UPDATE position_counters pc
JOIN tmp_user_map m ON pc.user_id = m.old_id
SET pc.user_id = m.new_id;

UPDATE request_types rt
JOIN tmp_user_map m ON rt.user_id = m.old_id
SET rt.user_id = m.new_id;

UPDATE scheduled_broadcasts sb
JOIN tmp_user_map m ON sb.user_id = m.old_id
SET sb.user_id = m.new_id;

UPDATE subaccounts s
JOIN tmp_user_map m ON s.user_id = m.old_id
SET s.user_id = m.new_id;

UPDATE usdt_wallets uw
JOIN tmp_user_map m ON uw.user_id = m.old_id
SET uw.user_id = m.new_id;

UPDATE whatsapp_sessions ws
JOIN tmp_user_map m ON ws.user_id = m.old_id
SET ws.user_id = m.new_id;

UPDATE client_requests cr
JOIN tmp_user_map m ON cr.completed_by_user_id = m.old_id
SET cr.completed_by_user_id = m.new_id
WHERE cr.completed_by_user_id IS NOT NULL;

-- 4) Drop FKs that still point to old_users_backup
ALTER TABLE abbreviations DROP FOREIGN KEY fk_abbreviations_user;
ALTER TABLE broadcast_uploads DROP FOREIGN KEY fk_bu_user;
ALTER TABLE chave_pix_keys DROP FOREIGN KEY fk_cpk_user;
ALTER TABLE client_requests DROP FOREIGN KEY fk_wallet_req_user;
ALTER TABLE direct_forwarding_rules DROP FOREIGN KEY direct_forwarding_rules_ibfk_1;
ALTER TABLE forwarding_rules DROP FOREIGN KEY fk_fr_user;
ALTER TABLE group_batches DROP FOREIGN KEY fk_gb_user;
ALTER TABLE message_templates DROP FOREIGN KEY fk_mt_user;
ALTER TABLE position_counters DROP FOREIGN KEY fk_pc_user;
ALTER TABLE request_types DROP FOREIGN KEY fk_request_types_user;
ALTER TABLE scheduled_broadcasts DROP FOREIGN KEY fk_sb_user;
ALTER TABLE subaccounts DROP FOREIGN KEY fk_subaccounts_user;
ALTER TABLE usdt_wallets DROP FOREIGN KEY fk_usdt_wallets_user;
ALTER TABLE whatsapp_sessions DROP FOREIGN KEY whatsapp_sessions_ibfk_1;

-- 5) Add new FKs referencing users.id
ALTER TABLE abbreviations
  ADD CONSTRAINT fk_abbreviations_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE broadcast_uploads
  ADD CONSTRAINT fk_bu_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE chave_pix_keys
  ADD CONSTRAINT fk_cpk_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE client_requests
  ADD CONSTRAINT fk_wallet_req_user
  FOREIGN KEY (completed_by_user_id) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE direct_forwarding_rules
  ADD CONSTRAINT direct_forwarding_rules_ibfk_1
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE forwarding_rules
  ADD CONSTRAINT fk_fr_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE group_batches
  ADD CONSTRAINT fk_gb_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE message_templates
  ADD CONSTRAINT fk_mt_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE position_counters
  ADD CONSTRAINT fk_pc_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE request_types
  ADD CONSTRAINT fk_request_types_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE scheduled_broadcasts
  ADD CONSTRAINT fk_sb_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE subaccounts
  ADD CONSTRAINT fk_subaccounts_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE usdt_wallets
  ADD CONSTRAINT fk_usdt_wallets_user
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE whatsapp_sessions
  ADD CONSTRAINT whatsapp_sessions_ibfk_1
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

COMMIT;

SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;

-- Optional: keep old_users_backup as archive.
-- DROP TABLE old_users_backup;
