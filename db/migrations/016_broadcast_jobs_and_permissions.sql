CREATE TABLE IF NOT EXISTS broadcast_jobs (
  id int NOT NULL AUTO_INCREMENT,
  user_id int DEFAULT NULL,
  source enum('manual','scheduled','replay') NOT NULL DEFAULT 'manual',
  source_ref_type varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  source_ref_id int DEFAULT NULL,
  parent_job_id int DEFAULT NULL,
  batch_id int DEFAULT NULL,
  upload_id int DEFAULT NULL,
  socket_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  message_text text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  attachment_snapshot longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  status enum('queued','running','paused','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
  paused tinyint(1) NOT NULL DEFAULT '0',
  cancel_requested tinyint(1) NOT NULL DEFAULT '0',
  target_total int NOT NULL DEFAULT '0',
  target_success int NOT NULL DEFAULT '0',
  target_failed int NOT NULL DEFAULT '0',
  target_cancelled int NOT NULL DEFAULT '0',
  started_at datetime DEFAULT NULL,
  completed_at datetime DEFAULT NULL,
  error_message varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_broadcast_jobs_status_created (status, created_at),
  KEY idx_broadcast_jobs_source (source, source_ref_id),
  KEY idx_broadcast_jobs_user (user_id),
  KEY idx_broadcast_jobs_parent (parent_job_id),
  CONSTRAINT fk_broadcast_jobs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_broadcast_jobs_upload FOREIGN KEY (upload_id) REFERENCES broadcast_uploads (id) ON DELETE SET NULL,
  CONSTRAINT fk_broadcast_jobs_batch FOREIGN KEY (batch_id) REFERENCES group_batches (id) ON DELETE SET NULL,
  CONSTRAINT fk_broadcast_jobs_parent FOREIGN KEY (parent_job_id) REFERENCES broadcast_jobs (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS broadcast_job_targets (
  id int NOT NULL AUTO_INCREMENT,
  broadcast_job_id int NOT NULL,
  group_jid varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  group_name varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  status enum('pending','sending','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT '0',
  whatsapp_message_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  last_error varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  last_attempt_at datetime DEFAULT NULL,
  sent_at datetime DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY ux_broadcast_job_group (broadcast_job_id, group_jid),
  KEY idx_broadcast_job_targets_status (status),
  KEY idx_broadcast_job_targets_message (whatsapp_message_id),
  CONSTRAINT fk_broadcast_job_targets_job FOREIGN KEY (broadcast_job_id) REFERENCES broadcast_jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS broadcast_job_actions (
  id int NOT NULL AUTO_INCREMENT,
  broadcast_job_id int NOT NULL,
  user_id int DEFAULT NULL,
  action enum('create','start','pause','resume','cancel','retry_failed','replay','schedule_trigger') NOT NULL,
  details longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_broadcast_job_actions_job (broadcast_job_id),
  KEY idx_broadcast_job_actions_user (user_id),
  CONSTRAINT fk_broadcast_job_actions_job FOREIGN KEY (broadcast_job_id) REFERENCES broadcast_jobs (id) ON DELETE CASCADE,
  CONSTRAINT fk_broadcast_job_actions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (action, description, module) VALUES
('broadcast:jobs:view', 'View broadcast jobs history and status', 'broadcast'),
('broadcast:jobs:control', 'Pause, resume, cancel and retry broadcast jobs', 'broadcast'),
('broadcast:jobs:replay', 'Replay previous broadcast jobs', 'broadcast');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.action IN ('broadcast:jobs:view','broadcast:jobs:control','broadcast:jobs:replay')
WHERE r.name = 'Administrator';
