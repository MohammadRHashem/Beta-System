CREATE TABLE IF NOT EXISTS `subaccount_profile_entries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subaccount_id` int(11) NOT NULL,
  `label` varchar(120) DEFAULT NULL,
  `account_holder_name` varchar(255) NOT NULL,
  `institution_name` varchar(255) NOT NULL,
  `pix_key` varchar(255) NOT NULL,
  `pix_copy_code` text DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_spe_subaccount_sort` (`subaccount_id`,`is_active`,`sort_order`,`id`),
  CONSTRAINT `fk_spe_subaccount` FOREIGN KEY (`subaccount_id`) REFERENCES `subaccounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
