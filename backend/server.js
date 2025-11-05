require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const authMiddleware = require('./middleware/authMiddleware');
const path = require('path');
const fs = require('fs');

// --- Controllers ---
const authController = require('./controllers/authController');
const whatsappController = require('./controllers/whatsappController');
const batchController = require('./controllers/batchController');
const templateController = require('./controllers/templateController');
const settingsController = require('./controllers/settingsController');
const chavePixController = require('./controllers/chavePixController');
const abbreviationController = require('./controllers/abbreviationController');
const invoiceController = require('./controllers/invoiceController');
const positionController = require('./controllers/positionController');
const directForwardingController = require('./controllers/directForwardingController');
const alfaTrustController = require('./controllers/alfaTrustController');
const subaccountController = require('./controllers/subaccountController');

const portalController = require('./controllers/portalController');
const portalAuthMiddleware = require('./middleware/portalAuthMiddleware');

const portalRoutes = require('./routes/portalRoutes');


const app = express();
const server = http.createServer(app);

const productionFrontendUrlWithPort = "https://platform.betaserver.dev:4433";
const productionFrontendUrl = "https://platform.betaserver.dev";

const io = new Server(server, {
    path: "/socket.io/",
    cors: {
        origin: [productionFrontendUrlWithPort, productionFrontendUrl],
        methods: ["GET", "POST"]
    }
});

app.use(cors({ origin: productionFrontendUrl }));
app.use(express.json());
app.use((req, res, next) => { req.io = io; next(); });

io.on('connection', (socket) => {
    console.log(`[Socket.io] User connected: ${socket.id}`);
    socket.on('disconnect', () => { console.log(`[Socket.io] User disconnected: ${socket.id}`); });
});

// --- ROUTES ---

app.use('/portal', portalRoutes);


// --- ADMIN API ROUTES ---
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);

// All subsequent /api routes are protected by the admin middleware
app.use('/api', authMiddleware);

// --- NOTE: We will now define API routes on a separate router for clarity ---
const apiRouter = express.Router();

apiRouter.get('/status', whatsappController.getStatus);
apiRouter.post('/logout', whatsappController.logout);
apiRouter.get('/groups', whatsappController.getGroups);
apiRouter.post('/groups/sync', whatsappController.syncGroups);
apiRouter.post('/broadcast', whatsappController.broadcastMessage);
// ... (all your other existing API routes will be moved here)
// Batches
apiRouter.get('/batches', batchController.getAllBatches);
apiRouter.post('/batches', batchController.createBatch);
apiRouter.get('/batches/:id', batchController.getGroupIdsByBatch);
apiRouter.put('/batches/:id', batchController.updateBatch);
apiRouter.delete('/batches/:id', batchController.deleteBatch);
// Templates
apiRouter.get('/templates', templateController.getAllTemplates);
apiRouter.post('/templates', templateController.createTemplate);
apiRouter.put('/templates/:id', templateController.updateTemplate);
apiRouter.delete('/templates/:id', templateController.deleteTemplate);
// Settings
apiRouter.get('/settings/forwarding', settingsController.getForwardingRules);
apiRouter.post('/settings/forwarding', settingsController.createForwardingRule);
apiRouter.put('/settings/forwarding/:id', settingsController.updateForwardingRule);
apiRouter.patch('/settings/forwarding/:id/toggle', settingsController.toggleForwardingRule);
apiRouter.delete('/settings/forwarding/:id', settingsController.deleteForwardingRule);
apiRouter.get('/settings/groups', settingsController.getGroupSettings);
apiRouter.post('/settings/groups', settingsController.updateGroupSetting);
apiRouter.get('/settings/auto-confirmation', settingsController.getAutoConfirmationStatus);
apiRouter.post('/settings/auto-confirmation', settingsController.setAutoConfirmationStatus);
apiRouter.get('/settings/alfa-api-confirmation', settingsController.getAlfaApiConfirmationStatus);
apiRouter.post('/settings/alfa-api-confirmation', settingsController.setAlfaApiConfirmationStatus);
apiRouter.get('/settings/troca-coin-method', settingsController.getTrocaCoinMethod);
apiRouter.post('/settings/troca-coin-method', settingsController.setTrocaCoinMethod);
// Chave PIX
apiRouter.get('/chave-pix', chavePixController.getAllKeys);
apiRouter.post('/chave-pix', chavePixController.createKey);
apiRouter.put('/chave-pix/:id', chavePixController.updateKey);
apiRouter.delete('/chave-pix/:id', chavePixController.deleteKey);
// Abbreviations
apiRouter.get('/abbreviations', abbreviationController.getAll);
apiRouter.post('/abbreviations', abbreviationController.create);
apiRouter.put('/abbreviations/:id', abbreviationController.update);
apiRouter.delete('/abbreviations/:id', abbreviationController.delete);
// Invoices
apiRouter.get('/invoices', invoiceController.getAllInvoices);
apiRouter.post('/invoices', invoiceController.createInvoice);
apiRouter.put('/invoices/:id', invoiceController.updateInvoice);
apiRouter.delete('/invoices/:id', invoiceController.deleteInvoice);
apiRouter.get('/invoices/recipients', invoiceController.getRecipientNames);
apiRouter.get('/invoices/export', invoiceController.exportInvoices);
apiRouter.get('/invoices/media/:id', invoiceController.getInvoiceMedia);
// Direct Forwarding
apiRouter.get('/direct-forwarding', directForwardingController.getAllRules);
apiRouter.post('/direct-forwarding', directForwardingController.createRule);
apiRouter.delete('/direct-forwarding/:id', directForwardingController.deleteRule);
// Position
apiRouter.get('/position/local', positionController.calculateLocalPosition);
apiRouter.get('/position/remote/:id', positionController.calculateRemotePosition);
apiRouter.get('/positions/counters', positionController.getAllCounters);
apiRouter.post('/positions/counters', positionController.createCounter);
apiRouter.put('/positions/counters/:id', positionController.updateCounter);
apiRouter.delete('/positions/counters/:id', positionController.deleteCounter);
// Alfa Trust
apiRouter.get('/alfa-trust/transactions', alfaTrustController.getTransactions);
apiRouter.get('/alfa-trust/export-pdf', alfaTrustController.exportPdf);
apiRouter.get('/alfa-trust/export-excel', alfaTrustController.exportTransactionsExcel);
apiRouter.post('/alfa-trust/trigger-sync', alfaTrustController.triggerManualSync);
apiRouter.post('/alfa-trust/notify-update', alfaTrustController.notifyUpdate);
// Subaccounts
apiRouter.get('/subaccounts', subaccountController.getAll);
apiRouter.post('/subaccounts', subaccountController.create);
apiRouter.put('/subaccounts/:id', subaccountController.update);
apiRouter.delete('/subaccounts/:id', subaccountController.delete);
apiRouter.get('/subaccounts/:id/credentials', subaccountController.getCredentials);
apiRouter.post('/subaccounts/:id/credentials/reset', subaccountController.resetPassword);

// Use the new apiRouter for all routes starting with /api
app.use('/api', apiRouter);


const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(frontendPath, 'index.html'));
    });
}

const HOST = '0.0.0.0';
const PORT = process.env.PORT || 5000;
server.listen(PORT, HOST, () => {
    console.log(`[SERVER] Server is running on http://${HOST}:${PORT}`);
    const whatsappService = require('./services/whatsappService');
    whatsappService.init(io);
});