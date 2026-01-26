-- Migration 004: Remove legacy broad permissions now replaced by granular ones

DELETE FROM permissions
WHERE action IN (
    'broadcast:manage_batches',
    'broadcast:manage_templates',
    'broadcast:manage_attachments',
    'broadcast:schedule',
    'settings:edit_usdt_wallets'
);
