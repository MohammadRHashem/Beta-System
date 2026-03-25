ALTER TABLE `subaccounts`
  ADD COLUMN `portal_source_type` enum('transactions','invoices') NOT NULL DEFAULT 'transactions' AFTER `account_type`,
  ADD COLUMN `invoice_recipient_pattern` varchar(255) DEFAULT NULL AFTER `assigned_group_name`;

ALTER TABLE `invoices`
  ADD COLUMN `is_portal_confirmed` tinyint(1) NOT NULL DEFAULT 1 AFTER `linked_transaction_source`;

CREATE TABLE IF NOT EXISTS `subaccount_invoice_manual_entries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subaccount_id` int(11) NOT NULL,
  `direction` enum('in','out') NOT NULL DEFAULT 'in',
  `sender_name` varchar(255) DEFAULT NULL,
  `counterparty_name` varchar(255) DEFAULT NULL,
  `amount` decimal(20,2) NOT NULL DEFAULT '0.00',
  `transaction_date` datetime NOT NULL,
  `is_portal_confirmed` tinyint(1) NOT NULL DEFAULT 1,
  `portal_notes` text DEFAULT NULL,
  `is_starting_entry` tinyint(1) NOT NULL DEFAULT 0,
  `created_by_user_id` int(11) DEFAULT NULL,
  `updated_by_user_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_sime_subaccount_date` (`subaccount_id`,`transaction_date`),
  KEY `idx_sime_start` (`subaccount_id`,`is_starting_entry`,`transaction_date`),
  CONSTRAINT `fk_sime_subaccount` FOREIGN KEY (`subaccount_id`) REFERENCES `subaccounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (action, description, module) VALUES
('subaccount:portal_advanced', 'Manage advanced portal source settings for subaccounts', 'subaccounts');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.action IN ('subaccount:portal_advanced')
WHERE r.name = 'Administrator';
