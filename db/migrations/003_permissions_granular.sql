-- Migration 003: Add granular permissions for broadcasts, USDT wallets, and client requests

INSERT IGNORE INTO permissions (action, description, module) VALUES
('broadcast:batches:view', 'View broadcast batches', 'broadcast'),
('broadcast:batches:create', 'Create broadcast batches', 'broadcast'),
('broadcast:batches:update', 'Edit broadcast batches', 'broadcast'),
('broadcast:batches:delete', 'Delete broadcast batches', 'broadcast'),
('broadcast:templates:view', 'View broadcast templates', 'broadcast'),
('broadcast:templates:create', 'Create broadcast templates', 'broadcast'),
('broadcast:templates:update', 'Edit broadcast templates', 'broadcast'),
('broadcast:templates:delete', 'Delete broadcast templates', 'broadcast'),
('broadcast:uploads:view', 'View broadcast uploads', 'broadcast'),
('broadcast:uploads:create', 'Upload broadcast attachments', 'broadcast'),
('broadcast:uploads:delete', 'Delete broadcast attachments', 'broadcast'),
('broadcast:schedules:view', 'View scheduled broadcasts', 'broadcast'),
('broadcast:schedules:create', 'Create scheduled broadcasts', 'broadcast'),
('broadcast:schedules:update', 'Edit scheduled broadcasts', 'broadcast'),
('broadcast:schedules:delete', 'Delete scheduled broadcasts', 'broadcast'),
('usdt_wallets:view', 'View USDT wallets', 'usdt_wallets'),
('usdt_wallets:create', 'Create USDT wallets', 'usdt_wallets'),
('usdt_wallets:update', 'Edit USDT wallets', 'usdt_wallets'),
('usdt_wallets:delete', 'Delete USDT wallets', 'usdt_wallets'),
('usdt_wallets:toggle', 'Enable or disable USDT wallets', 'usdt_wallets'),
('client_requests:view', 'View client requests', 'client_requests'),
('client_requests:complete', 'Mark client requests complete', 'client_requests'),
('client_requests:edit_amount', 'Edit client request amount', 'client_requests'),
('client_requests:edit_content', 'Edit client request content', 'client_requests'),
('client_requests:restore', 'Restore client requests', 'client_requests');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.action IN (
    'broadcast:batches:view',
    'broadcast:batches:create',
    'broadcast:batches:update',
    'broadcast:batches:delete',
    'broadcast:templates:view',
    'broadcast:templates:create',
    'broadcast:templates:update',
    'broadcast:templates:delete',
    'broadcast:uploads:view',
    'broadcast:uploads:create',
    'broadcast:uploads:delete',
    'broadcast:schedules:view',
    'broadcast:schedules:create',
    'broadcast:schedules:update',
    'broadcast:schedules:delete',
    'usdt_wallets:view',
    'usdt_wallets:create',
    'usdt_wallets:update',
    'usdt_wallets:delete',
    'usdt_wallets:toggle',
    'client_requests:view',
    'client_requests:complete',
    'client_requests:edit_amount',
    'client_requests:edit_content',
    'client_requests:restore'
)
WHERE r.name = 'Administrator';
