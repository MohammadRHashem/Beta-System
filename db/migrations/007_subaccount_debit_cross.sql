INSERT IGNORE INTO permissions (action, description, module) VALUES
('subaccount:debit_cross', 'Create debit entries for Cross subaccounts', 'subaccount');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.action IN ('subaccount:debit_cross')
WHERE r.name = 'Administrator';
