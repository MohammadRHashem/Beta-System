const express = require('express');
const router = express.Router();

// --- Import all your controllers ---
const whatsappController = require('../controllers/whatsappController');
const batchController = require('../controllers/batchController');
const templateController = require('../controllers/templateController');
const settingsController = require('../controllers/settingsController');
const chavePixController = require('../controllers/chavePixController');
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
const clientRequestController = require('../controllers/clientRequestController'); // Renamed
const requestTypesController = require('../controllers/requestTypesController'); // New Controller
const bridgeController = require('../controllers/bridgeController');


router.get('/manual/pending', manualReviewController.getPendingInvoices);
router.get('/manual/candidates', manualReviewController.getCandidates);
router.post('/manual/confirm', manualReviewController.confirmInvoice);
router.post('/manual/reject', manualReviewController.rejectInvoice);
router.get('/manual/candidate-invoices', manualReviewController.getCandidateInvoices);
router.post('/manual/clear-all', manualReviewController.clearAllPending);

// --- Define all ADMIN routes that require authentication ---
router.get('/status', whatsappController.getStatus);
router.post('/logout', whatsappController.logout);
router.get('/groups', whatsappController.getGroups);
router.post('/groups/sync', whatsappController.syncGroups);
router.post('/broadcast', whatsappController.broadcastMessage);

// Batches
router.get('/batches', batchController.getAllBatches);
router.post('/batches', batchController.createBatch);
router.get('/batches/:id', batchController.getGroupIdsByBatch);
router.put('/batches/:id', batchController.updateBatch);
router.delete('/batches/:id', batchController.deleteBatch);

// Templates
router.get('/templates', templateController.getAllTemplates);
router.post('/templates', templateController.createTemplate);
router.put('/templates/:id', templateController.updateTemplate);
router.delete('/templates/:id', templateController.deleteTemplate);

// Settings
router.get('/settings/forwarding', settingsController.getForwardingRules);
router.post('/settings/forwarding', settingsController.createForwardingRule);
router.put('/settings/forwarding/:id', settingsController.updateForwardingRule);
router.patch('/settings/forwarding/:id/toggle', settingsController.toggleForwardingRule);
router.patch('/settings/forwarding/:id/toggle-reply', settingsController.toggleForwardingRuleReply);
router.delete('/settings/forwarding/:id', settingsController.deleteForwardingRule);
router.get('/settings/groups', settingsController.getGroupSettings);
router.post('/settings/groups', settingsController.updateGroupSetting);
router.get('/settings/auto-confirmation', settingsController.getAutoConfirmationStatus);
router.post('/settings/auto-confirmation', settingsController.setAutoConfirmationStatus);
router.get('/settings/alfa-api-confirmation', settingsController.getAlfaApiConfirmationStatus);
router.post('/settings/alfa-api-confirmation', settingsController.setAlfaApiConfirmationStatus);
router.get('/settings/troca-coin-method', settingsController.getTrocaCoinMethod);
router.post('/settings/troca-coin-method', settingsController.setTrocaCoinMethod);

// Chave PIX
router.get('/chave-pix', chavePixController.getAllKeys);
router.post('/chave-pix', chavePixController.createKey);
router.put('/chave-pix/:id', chavePixController.updateKey);
router.delete('/chave-pix/:id', chavePixController.deleteKey);

// Abbreviations
router.get('/abbreviations', abbreviationController.getAll);
router.post('/abbreviations', abbreviationController.create);
router.put('/abbreviations/:id', abbreviationController.update);
router.delete('/abbreviations/:id', abbreviationController.delete);

// Invoices
router.get('/invoices', invoiceController.getAllInvoices);
router.post('/invoices', invoiceController.createInvoice);
router.put('/invoices/:id', invoiceController.updateInvoice);
router.delete('/invoices/:id', invoiceController.deleteInvoice);
router.get('/invoices/recipients', invoiceController.getRecipientNames);
router.get('/invoices/export', invoiceController.exportInvoices);
router.get('/invoices/media/:id', invoiceController.getInvoiceMedia);

// Direct Forwarding
router.get('/direct-forwarding', directForwardingController.getAllRules);
router.post('/direct-forwarding', directForwardingController.createRule);
router.delete('/direct-forwarding/:id', directForwardingController.deleteRule);

// Position
router.get('/position/local', positionController.calculateLocalPosition);
router.get('/position/remote/:id', positionController.calculateRemotePosition);
router.get('/positions/counters', positionController.getAllCounters);
router.post('/positions/counters', positionController.createCounter);
router.put('/positions/counters/:id', positionController.updateCounter);
router.delete('/positions/counters/:id', positionController.deleteCounter);

// Alfa Trust
router.get('/alfa-trust/transactions', alfaTrustController.getTransactions);
router.get('/alfa-trust/export-pdf', alfaTrustController.exportPdf);
router.get('/alfa-trust/export-excel', alfaTrustController.exportTransactionsExcel);
router.post('/alfa-trust/trigger-sync', alfaTrustController.triggerManualSync);
router.post('/alfa-trust/notify-update', alfaTrustController.notifyUpdate);

// Subaccounts
router.get('/subaccounts', subaccountController.getAll);
router.post('/subaccounts', subaccountController.create);
router.put('/subaccounts/:id', subaccountController.update);
router.delete('/subaccounts/:id', subaccountController.delete);
router.get('/subaccounts/:id/credentials', subaccountController.getCredentials);
router.post('/subaccounts/:id/credentials/reset', subaccountController.resetPassword);
router.get('/sub-customers', subCustomerController.getSubCustomers);


router.get('/subaccounts/:subaccountId/recibos', subaccountController.getRecibosTransactions);
router.post('/subaccounts/reassign', subaccountController.reassignTransaction);

router.post('/subaccounts/:id/hard-refresh', subaccountController.triggerHardRefresh);

// USDT & Schedules
router.use('/usdt-wallets', usdtWalletRoutes);
router.use('/scheduled-broadcasts', scheduledBroadcastRoutes);

router.get('/trkbit/transactions', trkbitController.getTransactions);
router.get('/trkbit/export', trkbitController.exportExcel);

router.get('/settings/trkbit-confirmation', settingsController.getTrkbitConfirmationStatus);
router.post('/settings/trkbit-confirmation', settingsController.setTrkbitConfirmationStatus);

router.get('/client-requests', clientRequestController.getPendingRequests);
router.patch('/client-requests/:id/complete', clientRequestController.completeRequest);
router.patch('/client-requests/:id/amount', clientRequestController.updateRequestAmount); // New
router.patch('/client-requests/:id/content', clientRequestController.updateRequestContent);

// Request Types (New)
router.get('/request-types', requestTypesController.getAll);

// Request Types (New)
router.get('/request-types', requestTypesController.getAll);
router.post('/request-types', requestTypesController.create);
router.put('/request-types/:id', requestTypesController.update);
router.delete('/request-types/:id', requestTypesController.delete);


module.exports = router;