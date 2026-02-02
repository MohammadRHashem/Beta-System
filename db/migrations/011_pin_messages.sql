CREATE TABLE IF NOT EXISTS pinned_messages (
  id int NOT NULL AUTO_INCREMENT,
  user_id int NOT NULL,
  message_text text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  upload_id int DEFAULT NULL,
  duration_seconds int DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pinned_messages_user_id (user_id),
  CONSTRAINT fk_pinned_messages_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_pinned_messages_upload FOREIGN KEY (upload_id) REFERENCES broadcast_uploads (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pinned_message_targets (
  id int NOT NULL AUTO_INCREMENT,
  pinned_message_id int NOT NULL,
  group_jid varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  group_name varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  status enum('pending','pinned','failed') NOT NULL DEFAULT 'pending',
  error_message varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  whatsapp_message_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  pinned_at datetime DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pmt_pin (pinned_message_id),
  KEY idx_pmt_status (status),
  CONSTRAINT fk_pmt_pin FOREIGN KEY (pinned_message_id) REFERENCES pinned_messages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
