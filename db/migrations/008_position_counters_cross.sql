ALTER TABLE position_counters
  ADD COLUMN local_mode enum('keyword','cross') NOT NULL DEFAULT 'keyword' AFTER sub_type,
  ADD COLUMN cross_variant enum('all','geral','chave') DEFAULT NULL AFTER local_mode,
  ADD COLUMN subaccount_id int DEFAULT NULL AFTER cross_variant,
  ADD KEY idx_pc_subaccount_id (subaccount_id),
  ADD CONSTRAINT fk_pc_subaccount FOREIGN KEY (subaccount_id) REFERENCES subaccounts (id) ON DELETE SET NULL;
