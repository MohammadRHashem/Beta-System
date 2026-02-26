ALTER TABLE request_types
  ADD COLUMN IF NOT EXISTS track_content_history TINYINT(1) NOT NULL DEFAULT 0 AFTER is_enabled,
  ADD COLUMN IF NOT EXISTS content_label VARCHAR(80) DEFAULT NULL AFTER name;

INSERT IGNORE INTO permissions (action, description, module) VALUES
('client_requests:delete', 'Delete client requests', 'client_requests');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.action IN ('client_requests:delete')
WHERE r.name = 'Administrator';