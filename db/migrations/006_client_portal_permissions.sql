INSERT IGNORE INTO permissions (action, description, module) VALUES
('client_portal:access', 'Access client portal as client (full access)', 'client_portal');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.action IN ('client_portal:access')
WHERE r.name = 'Administrator';
