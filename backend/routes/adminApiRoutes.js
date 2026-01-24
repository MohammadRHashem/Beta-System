const express = require('express');
const router = express.Router();
const checkPermission = require('../middleware/permissionMiddleware');

// --- Import all controllers ---
const whatsappController = require('../controllers/whatsappController');
const userAdminController = require('../controllers/userAdminController');
const batchController = require('../controllers/batchController');
const templateController = require('../controllers/templateController');
const settingsController = require('../controllers/settingsController');
const abbreviationController = require('../controllers/abbreviationController');
const invoiceController = require('../controllers/invoiceController');
const positionController = require('../controllers/positionController');
const directForwardingController = require('../controllers/directForwardingController');
const alfaTrustController = require('../controllers/alfaTrustController');
const subaccountController = require('../controllers/subaccountController');
const usdtWalletRoutes = require('./usdtWalletRoutes');
const scheduledBroadcastRoutes = require('./scheduledBroadcastRoutes');
const subCustomerController = require('../controllers/subCustomerController');
const trkbitController = require('../controllers/trkbitController');
const manualReviewController = require('../controllers/manualReviewController');
const clientRequestController = require('../controllers/clientRequestController');
const requestTypesController = require('../controllers/requestTypesController');
const broadcastUploadController = require('../controllers/broadcastUploadController');


// ===================================
// === HIGH-LEVEL ADMIN & RBAC ROUTES ===
// ===================================
router.get('/admin/users', checkPermission('admin:view_users'), userAdminController.getAllUsers);
router.post('/admin/users', checkPermission('admin:manage_users'), userAdminController.createUser);
router.put('/admin/users/:id', checkPermission('admin:manage_users'), userAdminController.updateUser);

router.get('/admin/roles', checkPermission('admin:view_roles'), userAdminController.getAllRoles);
router.get('/admin/roles/:id/permissions', checkPermission('admin:view_roles'), userAdminController.getRolePermissions);
router.put('/admin/roles/:id/permissions', checkPermission('admin:manage_roles'), userAdminController.updateRolePermissions);

router.get('/admin/audit-log', checkPermission('admin:view_audit_log'), userAdminController.getAuditLogs);


// --- Core WhatsApp & Broadcast ---
router.get('/status', whatsappController.getStatus); // Publicly viewable by any authenticated user
router.get('/groups', whatsappController.getGroups);
router.post('/groups/sync', checkPermission('admin:manage_roles'), whatsappController.syncGroups); // High-level admin task
router.post('/broadcast', checkPermission('broadcast:send'), whatsappController.broadcastMessage);


// --- Batches ---
router.get('/batches', checkPermission('broadcast:manage_batches'), batchController.getAllBatches);
router.post('/batches', checkPermission('broadcast:manage_batches'), batchController.createBatch);
router.get('/batches/:id', checkPermission('broadcast:manage_batches'), batchController.getGroupIdsByBatch);
router.put('/batches/:id', checkPermission('broadcast:manage_batches'), batchController.updateBatch);
router.delete('/batches/:id', checkPermission('broadcast:manage_batches'), batchController.deleteBatch);


// --- Templates ---
router.get('/templates', checkPermission('broadcast:manage_templates'), templateController.getAllTemplates);
router.post('/templates', checkPermission('broadcast:manage_templates'), templateController.createTemplate);
router.put('/templates/:id', checkPermission('broadcast:manage_templates'), templateController.updateTemplate);
router.delete('/templates/:id', checkPermission('broadcast:manage_templates'), templateController.deleteTemplate);


// --- Broadcast Uploads ---
router.get('/broadcasts/uploads', checkPermission('broadcast:manage_attachments'), broadcastUploadController.getAllUploads);
router.post('/broadcasts/upload', checkPermission('broadcast:manage_attachments'), (req, res, next) => {
    req.broadcastUpload.single('file')(req, res, (err) => {
        if (err) { return res.status(400).json({ message: 'File upload failed.', error: err.message }); }
        next();
    });
}, broadcastUploadController.handleUpload);
router.delete('/broadcasts/uploads/:id', checkPermission('broadcast:manage_attachments'), broadcastUploadController.deleteUpload);


// --- Invoices ---
router.get('/invoices', checkPermission('invoice:view'), invoiceController.getAllInvoices);
router.post('/invoices', checkPermission('invoice:create'), invoiceController.createInvoice);
router.put('/invoices/:id', checkPermission('invoice:edit'), invoiceController.updateInvoice);
router.delete('/invoices/:id', checkPermission('invoice:delete'), invoiceController.deleteInvoice);
router.get('/invoices/recipients', checkPermission('invoice:view'), invoiceController.getRecipientNames);
router.get('/invoices/export', checkPermission('invoice:export'), invoiceController.exportInvoices);
router.get('/invoices/media/:id', checkPermission('invoice:view'), invoiceController.getInvoiceMedia);


// --- Manual Review ---
router.get('/manual/pending', checkPermission('manual_review:view'), manualReviewController.getPendingInvoices);
router.get('/manual/candidates', checkPermission('manual_review:view'), manualReviewController.getCandidates); // Part of viewing
router.post('/manual/confirm', checkPermission('manual_review:confirm'), manualReviewController.confirmInvoice);
router.post('/manual/reject', checkPermission('manual_review:reject'), manualReviewController.rejectInvoice);
router.get('/manual/candidate-invoices', checkPermission('invoice:link'), manualReviewController.getCandidateInvoices);
router.post('/manual/clear-all', checkPermission('manual_review:clear'), manualReviewController.clearAllPending);


// --- Subaccounts ---
router.get('/subaccounts', checkPermission('subaccount:view'), subaccountController.getAll);
router.post('/subaccounts', checkPermission('subaccount:manage'), subaccountController.create);
router.put('/subaccounts/:id', checkPermission('subaccount:manage'), subaccountController.update);
router.delete('/subaccounts/:id', checkPermission('subaccount:manage'), subaccountController.delete);
router.get('/subaccounts/:id/credentials', checkPermission('subaccount:manage_credentials'), subaccountController.getCredentials);
router.post('/subaccounts/:id/credentials/reset', checkPermission('subaccount:manage_credentials'), subaccountController.resetPassword);
router.post('/subaccounts/:id/hard-refresh', checkPermission('subaccount:manage'), subaccountController.triggerHardRefresh);
router.get('/subaccounts/:subaccountId/recibos', checkPermission('subaccount:reassign_transactions'), subaccountController.getRecibosTransactions);
router.post('/subaccounts/reassign', checkPermission('subaccount:reassign_transactions'), subaccountController.reassignTransaction);


// --- BI & Financial Tools ---
router.get('/position/local', checkPermission('finance:view_dashboards'), positionController.calculateLocalPosition);
router.get('/position/remote/:id', checkPermission('finance:view_dashboards'), positionController.calculateRemotePosition);
router.get('/positions/counters', checkPermission('finance:view_dashboards'), positionController.getAllCounters);
router.post('/positions/counters', checkPermission('finance:manage_counters'), positionController.createCounter);
router.put('/positions/counters/:id', checkPermission('finance:manage_counters'), positionController.updateCounter);
router.delete('/positions/counters/:id', checkPermission('finance:manage_counters'), positionController.deleteCounter);
router.get('/sub-customers', checkPermission('finance:view_dashboards'), subCustomerController.getSubCustomers);
router.get('/alfa-trust/transactions', checkPermission('finance:view_bank_statements'), alfaTrustController.getTransactions);
router.get('/alfa-trust/export-pdf', checkPermission('finance:view_bank_statements'), alfaTrustController.exportPdf);
router.get('/alfa-trust/export-excel', checkPermission('finance:view_bank_statements'), alfaTrustController.exportTransactionsExcel);
router.post('/alfa-trust/notify-update', alfaTrustController.notifyUpdate);
router.get('/trkbit/transactions', checkPermission('finance:view_bank_statements'), trkbitController.getTransactions);
router.get('/trkbit/export', checkPermission('finance:view_bank_statements'), trkbitController.exportExcel);


// --- Client Requests ---
router.get('/client-requests', clientRequestController.getAllRequests); // Viewable by default
router.patch('/client-requests/:id/complete', clientRequestController.completeRequest);
router.patch('/client-requests/:id/amount', clientRequestController.updateRequestAmount);
router.patch('/client-requests/:id/restore', clientRequestController.restoreRequest);
router.patch('/client-requests/:id/content', clientRequestController.updateRequestContent);


// --- Settings & Rules (Most require settings:edit_rules) ---
router.get('/settings/forwarding', checkPermission('settings:view'), settingsController.getForwardingRules);
router.post('/settings/forwarding', checkPermission('settings:edit_rules'), settingsController.createForwardingRule);
router.put('/settings/forwarding/:id', checkPermission('settings:edit_rules'), settingsController.updateForwardingRule);
router.patch('/settings/forwarding/:id/toggle', checkPermission('settings:edit_rules'), settingsController.toggleForwardingRule);
router.patch('/settings/forwarding/:id/toggle-reply', checkPermission('settings:edit_rules'), settingsController.toggleForwardingRuleReply);
router.delete('/settings/forwarding/:id', checkPermission('settings:edit_rules'), settingsController.deleteForwardingRule);
router.get('/settings/groups', checkPermission('settings:view'), settingsController.getGroupSettings);
router.post('/settings/groups', checkPermission('settings:edit_rules'), settingsController.updateGroupSetting);
router.get('/direct-forwarding', checkPermission('settings:view'), directForwardingController.getAllRules);
router.post('/direct-forwarding', checkPermission('settings:edit_rules'), directForwardingController.createRule);
router.delete('/direct-forwarding/:id', checkPermission('settings:edit_rules'), directForwardingController.deleteRule);
router.get('/abbreviations', checkPermission('settings:view'), abbreviationController.getAll);
router.post('/abbreviations', checkPermission('settings:edit_abbreviations'), abbreviationController.create);
router.put('/abbreviations/:id', checkPermission('settings:edit_abbreviations'), abbreviationController.update);
router.delete('/abbreviations/:id', checkPermission('settings:edit_abbreviations'), abbreviationController.delete);
router.get('/request-types', checkPermission('settings:view'), requestTypesController.getAll);
router.post('/request-types', checkPermission('settings:edit_request_triggers'), requestTypesController.create);
router.put('/request-types/:id', checkPermission('settings:edit_request_triggers'), requestTypesController.update);
router.post('/request-types/update-order', checkPermission('settings:edit_request_triggers'), requestTypesController.updateOrder);
router.delete('/request-types/:id', checkPermission('settings:edit_request_triggers'), requestTypesController.delete);


// --- Master Confirmation Switches ---
router.get('/settings/auto-confirmation', checkPermission('settings:view'), settingsController.getAutoConfirmationStatus);
router.post('/settings/auto-confirmation', checkPermission('settings:toggle_confirmations'), settingsController.setAutoConfirmationStatus);
router.get('/settings/alfa-api-confirmation', checkPermission('settings:view'), settingsController.getAlfaApiConfirmationStatus);
router.post('/settings/alfa-api-confirmation', checkPermission('settings:toggle_confirmations'), settingsController.setAlfaApiConfirmationStatus);
router.get('/settings/troca-coin-method', checkPermission('settings:view'), settingsController.getTrocaCoinMethod);
router.post('/settings/troca-coin-method', checkPermission('settings:toggle_confirmations'), settingsController.setTrocaCoinMethod);
router.get('/settings/trkbit-confirmation', checkPermission('settings:view'), settingsController.getTrkbitConfirmationStatus);
router.post('/settings/trkbit-confirmation', checkPermission('settings:toggle_confirmations'), settingsController.setTrkbitConfirmationStatus);


// --- Standalone Routes ---
router.use('/usdt-wallets', usdtWalletRoutes); // Permissions are handled inside this route file
router.use('/scheduled-broadcasts', scheduledBroadcastRoutes); // Permissions are handled inside this route file


// DEPRECATED/LEGACY: Chave PIX (if needed, should be under a permission)
router.get('/chave-pix', (req, res) => res.status(410).json({ message: "This feature is deprecated." }));



// ----- OLD CODE ------
// ----- OLD CODE ------
// ----- OLD CODE ------
// ----- OLD CODE ------
// ----- OLD CODE ------


// router.get('/manual/pending', manualReviewController.getPendingInvoices);
// router.get('/manual/candidates', manualReviewController.getCandidates);
// router.post('/manual/confirm', manualReviewController.confirmInvoice);
// router.post('/manual/reject', manualReviewController.rejectInvoice);
// router.get('/manual/candidate-invoices', manualReviewController.getCandidateInvoices);
// router.post('/manual/clear-all', manualReviewController.clearAllPending);

// // --- Define all ADMIN routes that require authentication ---
// router.get('/status', whatsappController.getStatus);
// router.post('/logout', whatsappController.logout);
// router.get('/groups', whatsappController.getGroups);
// router.post('/groups/sync', whatsappController.syncGroups);
// router.post('/broadcast', whatsappController.broadcastMessage);

// // Batches
// router.get('/batches', batchController.getAllBatches);
// router.post('/batches', batchController.createBatch);
// router.get('/batches/:id', batchController.getGroupIdsByBatch);
// router.put('/batches/:id', batchController.updateBatch);
// router.delete('/batches/:id', batchController.deleteBatch);

// // Templates
// router.get('/templates', templateController.getAllTemplates);
// router.post('/templates', templateController.createTemplate);
// router.put('/templates/:id', templateController.updateTemplate);
// router.delete('/templates/:id', templateController.deleteTemplate);

// // Settings
// router.get('/settings/forwarding', settingsController.getForwardingRules);
// router.post('/settings/forwarding', settingsController.createForwardingRule);
// router.put('/settings/forwarding/:id', settingsController.updateForwardingRule);
// router.patch('/settings/forwarding/:id/toggle', settingsController.toggleForwardingRule);
// router.patch('/settings/forwarding/:id/toggle-reply', settingsController.toggleForwardingRuleReply);
// router.delete('/settings/forwarding/:id', settingsController.deleteForwardingRule);
// router.get('/settings/groups', settingsController.getGroupSettings);
// router.post('/settings/groups', settingsController.updateGroupSetting);
// router.get('/settings/auto-confirmation', settingsController.getAutoConfirmationStatus);
// router.post('/settings/auto-confirmation', settingsController.setAutoConfirmationStatus);
// router.get('/settings/alfa-api-confirmation', settingsController.getAlfaApiConfirmationStatus);
// router.post('/settings/alfa-api-confirmation', settingsController.setAlfaApiConfirmationStatus);
// router.get('/settings/troca-coin-method', settingsController.getTrocaCoinMethod);
// router.post('/settings/troca-coin-method', settingsController.setTrocaCoinMethod);

// // Chave PIX
// router.get('/chave-pix', chavePixController.getAllKeys);
// router.post('/chave-pix', chavePixController.createKey);
// router.put('/chave-pix/:id', chavePixController.updateKey);
// router.delete('/chave-pix/:id', chavePixController.deleteKey);

// // Abbreviations
// router.get('/abbreviations', abbreviationController.getAll);
// router.post('/abbreviations', abbreviationController.create);
// router.put('/abbreviations/:id', abbreviationController.update);
// router.delete('/abbreviations/:id', abbreviationController.delete);

// // Invoices
// router.get('/invoices', invoiceController.getAllInvoices);
// router.post('/invoices', invoiceController.createInvoice);
// router.put('/invoices/:id', invoiceController.updateInvoice);
// router.delete('/invoices/:id', invoiceController.deleteInvoice);
// router.get('/invoices/recipients', invoiceController.getRecipientNames);
// router.get('/invoices/export', invoiceController.exportInvoices);
// router.get('/invoices/media/:id', invoiceController.getInvoiceMedia);

// // Direct Forwarding
// router.get('/direct-forwarding', directForwardingController.getAllRules);
// router.post('/direct-forwarding', directForwardingController.createRule);
// router.delete('/direct-forwarding/:id', directForwardingController.deleteRule);

// // Position
// router.get('/position/local', positionController.calculateLocalPosition);
// router.get('/position/remote/:id', positionController.calculateRemotePosition);
// router.get('/positions/counters', positionController.getAllCounters);
// router.post('/positions/counters', positionController.createCounter);
// router.put('/positions/counters/:id', positionController.updateCounter);
// router.delete('/positions/counters/:id', positionController.deleteCounter);

// // Alfa Trust
// router.get('/alfa-trust/transactions', alfaTrustController.getTransactions);
// router.get('/alfa-trust/export-pdf', alfaTrustController.exportPdf);
// router.get('/alfa-trust/export-excel', alfaTrustController.exportTransactionsExcel);
// router.post('/alfa-trust/trigger-sync', alfaTrustController.triggerManualSync);
// router.post('/alfa-trust/notify-update', alfaTrustController.notifyUpdate);

// // Subaccounts
// router.get('/subaccounts', subaccountController.getAll);
// router.post('/subaccounts', subaccountController.create);
// router.put('/subaccounts/:id', subaccountController.update);
// router.delete('/subaccounts/:id', subaccountController.delete);
// router.get('/subaccounts/:id/credentials', subaccountController.getCredentials);
// router.post('/subaccounts/:id/credentials/reset', subaccountController.resetPassword);
// router.get('/sub-customers', subCustomerController.getSubCustomers);


// router.get('/subaccounts/:subaccountId/recibos', subaccountController.getRecibosTransactions);
// router.post('/subaccounts/reassign', subaccountController.reassignTransaction);

// router.post('/subaccounts/:id/hard-refresh', subaccountController.triggerHardRefresh);

// // USDT & Schedules
// router.use('/usdt-wallets', usdtWalletRoutes);
// router.use('/scheduled-broadcasts', scheduledBroadcastRoutes);

// router.get('/trkbit/transactions', trkbitController.getTransactions);
// router.get('/trkbit/export', trkbitController.exportExcel);

// router.get('/settings/trkbit-confirmation', settingsController.getTrkbitConfirmationStatus);
// router.post('/settings/trkbit-confirmation', settingsController.setTrkbitConfirmationStatus);

// router.get('/client-requests', clientRequestController.getAllRequests);
// router.patch('/client-requests/:id/complete', clientRequestController.completeRequest);
// router.patch('/client-requests/:id/amount', clientRequestController.updateRequestAmount); // New
// router.patch('/client-requests/:id/restore', clientRequestController.restoreRequest);
// router.patch('/client-requests/:id/content', clientRequestController.updateRequestContent);

// // Request Types (New)
// router.get('/request-types', requestTypesController.getAll);

// // Request Types (New)
// router.get('/request-types', requestTypesController.getAll);
// router.post('/request-types', requestTypesController.create);
// router.put('/request-types/:id', requestTypesController.update);
// router.post('/request-types/update-order', requestTypesController.updateOrder);
// router.delete('/request-types/:id', requestTypesController.delete);


// // Broadcast Uploads
// router.get('/broadcasts/uploads', broadcastUploadController.getAllUploads);
// router.post('/broadcasts/upload', (req, res, next) => {
//     // Middleware to handle the upload
//     req.broadcastUpload.single('file')(req, res, (err) => {
//         if (err) {
//             return res.status(400).json({ message: 'File upload failed.', error: err.message });
//         }
//         next();
//     });
// }, broadcastUploadController.handleUpload);
// router.delete('/broadcasts/uploads/:id', broadcastUploadController.deleteUpload);


module.exports = router;