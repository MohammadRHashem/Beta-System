require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const authMiddleware = require('./middleware/authMiddleware');
const path = require('path');
const fs = require('fs'); // Correctly import the 'fs' module

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
const io = new Server(server, { path: "/socket.io/", cors: { origin: "https://beta.hashemlabs.dev", methods: ["GET", "POST"] } });

app.use(cors({ origin: "https://beta.hashemlabs.dev" }));
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
// This middleware will protect all routes defined below it.
app.use(authMiddleware);

// --- WhatsApp & Broadcasting ---
app.get('/api/status', whatsappController.getStatus);
app.post('/api/logout', whatsappController.logout);
app.get('/api/groups', whatsappController.getGroups);
app.post('/api/groups/sync', whatsappController.syncGroups);
app.post('/api/broadcast', whatsappController.broadcastMessage);

// --- Batches ---
app.route('/api/batches')
    .get(batchController.getAllBatches)
    .post(batchController.createBatch);

app.route('/api/batches/:id')
    .get(batchController.getGroupIdsByBatch)
    .put(batchController.updateBatch)
    .delete(batchController.deleteBatch);

// --- Templates ---
app.route('/api/templates')
    .get(templateController.getAllTemplates)
    .post(templateController.createTemplate);

app.route('/api/templates/:id')
    .put(templateController.updateTemplate)
    .delete(templateController.deleteTemplate);

// --- Settings ---
app.route('/api/settings/forwarding')
    .get(settingsController.getForwardingRules)
    .post(settingsController.createForwardingRule);

app.route('/api/settings/forwarding/:id')
    .put(settingsController.updateForwardingRule)
    .delete(settingsController.deleteForwardingRule);

app.get('/api/settings/groups', settingsController.getGroupSettings);
app.post('/api/settings/groups', settingsController.updateGroupSetting);


// --- Chave PIX ---
app.route('/api/chave-pix')
    .get(chavePixController.getAllKeys)
    .post(chavePixController.createKey);

app.route('/api/chave-pix/:id')
    .put(chavePixController.updateKey)
    .delete(chavePixController.deleteKey);

// --- Abbreviations ---
app.route('/api/abbreviations')
    .get(abbreviationController.getAll)
    .post(abbreviationController.create);

app.route('/api/abbreviations/:id')
    .put(abbreviationController.update)
    .delete(abbreviationController.delete);

// --- Invoices ---
app.route('/api/invoices')
    .get(invoiceController.getAllInvoices)
    .post(invoiceController.createInvoice);
    
app.route('/api/invoices/:id')
    .put(invoiceController.updateInvoice)
    .delete(invoiceController.deleteInvoice);

app.get('/api/invoices/recipients', invoiceController.getRecipientNames);
app.get('/api/invoices/export', invoiceController.exportInvoices);
app.get('/api/invoices/media/:id', invoiceController.getInvoiceMedia);

// --- Serve Frontend (for production build) ---
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendPath)) {
    console.log(`Serving frontend from: ${frontendPath}`);
    app.use(express.static(frontendPath));
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(frontendPath, 'index.html'));
    });
}

// --- Server Initialization ---
const HOST = '0.0.0.0';
const PORT = process.env.PORT || 5000;
server.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
    // Pass the io instance to the whatsapp service for real-time events
    const whatsappService = require('./services/whatsappService');
    whatsappService.init(io);
});