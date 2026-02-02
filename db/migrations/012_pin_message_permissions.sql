INSERT IGNORE INTO permissions (action, description, module) VALUES
('pin:create', 'Create pin message jobs', 'pin_messages'),
('pin:view', 'View pin message history', 'pin_messages'),
('pin:retry', 'Retry failed pin message jobs', 'pin_messages');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.action IN ('pin:create','pin:view','pin:retry')
WHERE r.name = 'Administrator';
