require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const authMiddleware = require('./middleware/authMiddleware');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// --- Controllers ---
const authController = require('./controllers/authController');
const whatsappController = require('./controllers/whatsappController');
const batchController = require('./controllers/batchController');
const templateController = require('./controllers/templateController');
const settingsController = require('./controllers/settingsController');
const chavePixController = require('./controllers/chavePixController');
const abbreviationController = require('./controllers/abbreviationController');
const invoiceController = require('./controllers/invoiceController');

const app = express();
const server = http.createServer(app);

// === REVERT FOR PRODUCTION ===
// The origin for CORS and Socket.IO is now your live production domain.
const productionFrontendUrl = "https://beta.hashemlabs.dev";

const io = new Server(server, { path: "/socket.io/", cors: { origin: productionFrontendUrl, methods: ["GET", "POST"] } });

// Setup for file uploads in memory
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(cors({ origin: productionFrontendUrl }));
app.use(express.json());
app.use((req, res, next) => { req.io = io; next(); });

io.on('connection', (socket) => {
    console.log(`[Socket.io] User connected: ${socket.id}`);
    socket.on('disconnect', () => { console.log(`[Socket.io] User disconnected: ${socket.id}`); });
});

// --- PUBLIC AUTH ROUTES ---
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);

// --- PROTECTED ROUTES ---
app.use(authMiddleware);

// --- WhatsApp & Broadcasting ---
app.get('/api/status', whatsappController.getStatus);
app.post('/api/logout', whatsappController.logout);
app.get('/api/groups', whatsappController.getGroups);
app.post('/api/groups/sync', whatsappController.syncGroups);
app.post('/api/broadcast', whatsappController.broadcastMessage);

// --- Batches ---
app.get('/api/batches', batchController.getAllBatches);
app.post('/api/batches', batchController.createBatch);
app.get('/api/batches/:id', batchController.getGroupIdsByBatch);
app.put('/api/batches/:id', batchController.updateBatch);
app.delete('/api/batches/:id', batchController.deleteBatch);

// --- Templates ---
app.get('/api/templates', templateController.getAllTemplates);
app.post('/api/templates', templateController.createTemplate);
app.put('/api/templates/:id', templateController.updateTemplate);
app.delete('/api/templates/:id', templateController.deleteTemplate);

// --- Settings ---
app.get('/api/settings/forwarding', settingsController.getForwardingRules);
app.post('/api/settings/forwarding', settingsController.createForwardingRule);
app.put('/api/settings/forwarding/:id', settingsController.updateForwardingRule);
app.patch('/api/settings/forwarding/:id/toggle', settingsController.toggleForwardingRule);
app.delete('/api/settings/forwarding/:id', settingsController.deleteForwardingRule);
app.get('/api/settings/groups', settingsController.getGroupSettings);
app.post('/api/settings/groups', settingsController.updateGroupSetting);

// --- Chave PIX ---
app.get('/api/chave-pix', chavePixController.getAllKeys);
app.post('/api/chave-pix', chavePixController.createKey);
app.put('/api/chave-pix/:id', chavePixController.updateKey);
app.delete('/api/chave-pix/:id', chavePixController.deleteKey);

// --- Abbreviations ---
app.get('/api/abbreviations', abbreviationController.getAll);
app.post('/api/abbreviations', abbreviationController.create);
app.put('/api/abbreviations/:id', abbreviationController.update);
app.delete('/api/abbreviations/:id', abbreviationController.delete);

// --- Invoices ---
app.get('/api/invoices', invoiceController.getAllInvoices);
app.post('/api/invoices', invoiceController.createInvoice);
app.put('/api/invoices/:id', invoiceController.updateInvoice);
app.delete('/api/invoices/:id', invoiceController.deleteInvoice);
app.get('/api/invoices/recipients', invoiceController.getRecipientNames);
app.get('/api/invoices/export', invoiceController.exportInvoices);
app.post('/api/invoices/import', upload.single('file'), invoiceController.importInvoices);
app.get('/api/invoices/media/:id', invoiceController.getInvoiceMedia);

// --- Serve Frontend (for production build) ---
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendPath)) {
    console.log(`[SERVER] Found production frontend build at: ${frontendPath}`);
    app.use(express.static(frontendPath));
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(frontendPath, 'index.html'));
    });
}

// --- Server Initialization ---
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 5000;
server.listen(PORT, HOST, () => {
    console.log(`[SERVER] Server is running on http://${HOST}:${PORT}`);
    const whatsappService = require('./services/whatsappService');
    whatsappService.init(io);
});