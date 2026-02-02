ALTER TABLE subaccounts
  ADD COLUMN geral_pix_key varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER chave_pix;

CREATE TABLE IF NOT EXISTS trkbit_reassign_log (
  id int NOT NULL AUTO_INCREMENT,
  trkbit_transaction_id int NOT NULL,
  old_pix_key varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  new_pix_key varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  reason varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  user_id int DEFAULT NULL,
  username varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_trkbit_reassign_tx (trkbit_transaction_id),
  KEY idx_trkbit_reassign_new (new_pix_key),
  CONSTRAINT fk_trkbit_reassign_tx FOREIGN KEY (trkbit_transaction_id) REFERENCES trkbit_transactions (id) ON DELETE CASCADE,
  CONSTRAINT fk_trkbit_reassign_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
