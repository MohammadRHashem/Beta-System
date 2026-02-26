ALTER TABLE client_requests
  ADD COLUMN IF NOT EXISTS request_type_id INT NULL AFTER request_type,
  ADD COLUMN IF NOT EXISTS content_key VARCHAR(255) NULL AFTER content;

UPDATE client_requests cr
LEFT JOIN request_types rt ON rt.name = cr.request_type
SET cr.request_type_id = rt.id
WHERE cr.request_type_id IS NULL;

UPDATE client_requests
SET content_key = LOWER(
    TRIM(
      REGEXP_REPLACE(
        REPLACE(REPLACE(REPLACE(COALESCE(content, ''), CHAR(13), ' '), CHAR(10), ' '), CHAR(9), ' '),
        '[[:space:]]+',
        ' '
      )
    )
  )
WHERE content_key IS NULL OR content_key = '';

ALTER TABLE client_requests
  ADD INDEX idx_client_requests_history (request_type_id, is_completed, content_key, received_at, id);
