CREATE TABLE IF NOT EXISTS scheduled_withdrawals (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  subaccount_id int NOT NULL,
  schedule_type enum('ONCE','DAILY','WEEKLY') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  scheduled_at_time time NOT NULL,
  scheduled_at_date date DEFAULT NULL,
  scheduled_days_of_week json DEFAULT NULL,
  timezone varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'America/Sao_Paulo',
  is_active tinyint(1) NOT NULL DEFAULT '1',
  last_run_at datetime DEFAULT NULL,
  last_status enum('success','failed','skipped') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  last_error varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  last_response json DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sw_user (user_id),
  KEY idx_sw_subaccount (subaccount_id),
  KEY idx_sw_active (is_active),
  CONSTRAINT fk_sw_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_sw_subaccount FOREIGN KEY (subaccount_id) REFERENCES subaccounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (action, description, module) VALUES
('subaccount:withdrawals:view', 'View scheduled withdrawals', 'subaccount'),
('subaccount:withdrawals:create', 'Create scheduled withdrawals', 'subaccount'),
('subaccount:withdrawals:update', 'Update scheduled withdrawals', 'subaccount'),
('subaccount:withdrawals:delete', 'Delete scheduled withdrawals', 'subaccount');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.action IN (
  'subaccount:withdrawals:view',
  'subaccount:withdrawals:create',
  'subaccount:withdrawals:update',
  'subaccount:withdrawals:delete'
)
WHERE r.name = 'Administrator';
