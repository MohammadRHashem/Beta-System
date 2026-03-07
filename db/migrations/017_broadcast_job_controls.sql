ALTER TABLE broadcast_job_targets
  ADD COLUMN IF NOT EXISTS delete_status ENUM('none','deleted','failed') NOT NULL DEFAULT 'none' AFTER sent_at,
  ADD COLUMN IF NOT EXISTS delete_error VARCHAR(500) NULL AFTER delete_status,
  ADD COLUMN IF NOT EXISTS delete_attempted_at DATETIME NULL AFTER delete_error,
  ADD COLUMN IF NOT EXISTS edit_status ENUM('none','edited','failed') NOT NULL DEFAULT 'none' AFTER delete_attempted_at,
  ADD COLUMN IF NOT EXISTS edit_error VARCHAR(500) NULL AFTER edit_status,
  ADD COLUMN IF NOT EXISTS edit_attempted_at DATETIME NULL AFTER edit_error,
  ADD COLUMN IF NOT EXISTS edited_message_text TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER edit_attempted_at;

ALTER TABLE broadcast_job_actions
  MODIFY COLUMN action ENUM(
    'create',
    'start',
    'pause',
    'resume',
    'cancel',
    'retry_failed',
    'replay',
    'schedule_trigger',
    'delete_for_everyone',
    'edit_message'
  ) NOT NULL;
