INSERT IGNORE INTO permissions (action, description, module) VALUES
('trkbit:reassign', 'Reassign Trkbit transactions between PIX keys', 'trkbit');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.action IN ('trkbit:reassign')
WHERE r.name = 'Administrator';
