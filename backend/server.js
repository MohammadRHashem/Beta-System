require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const authMiddleware = require('./middleware/authMiddleware');

const authController = require('./controllers/authController');
const whatsappController = require('./controllers/whatsappController');
const batchController = require('./controllers/batchController');
const templateController = require('./controllers/templateController');
const settingsController = require('./controllers/settingsController');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { path: "/socket.io/", cors: { origin: "https://beta.hashemlabs.dev", methods: ["GET", "POST"] } });

app.use(cors({ origin: "https://beta.hashemlabs.dev" }));
app.use(express.json());
app.use((req, res, next) => { req.io = io; next(); });

io.on('connection', (socket) => {
    console.log(`[Socket.io] A user connected with ID: ${socket.id}`);
    socket.on('disconnect', () => { console.log(`[Socket.io] User disconnected with ID: ${socket.id}`); });
});

// --- PUBLIC AUTHENTICATION ROUTES ---
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);

// --- PROTECTED WHATSAPP ROUTES ---
// Everything below this line requires a valid token
app.get('/api/status', authMiddleware, whatsappController.getStatus);
app.post('/api/logout', authMiddleware, whatsappController.logout);
app.get('/api/groups', authMiddleware, whatsappController.getGroups);
app.post('/api/groups/sync', authMiddleware, whatsappController.syncGroups);
app.post('/api/broadcast', authMiddleware, whatsappController.broadcastMessage);

// --- PROTECTED BATCH & TEMPLATE ROUTES ---
app.get('/api/batches', authMiddleware, batchController.getAllBatches);
app.get('/api/batches/:id', authMiddleware, batchController.getGroupIdsByBatch);
app.post('/api/batches', authMiddleware, batchController.createBatch);
app.put('/api/batches/:id', authMiddleware, batchController.updateBatch);
app.delete('/api/batches/:id', authMiddleware, batchController.deleteBatch);
app.get('/api/templates', authMiddleware, templateController.getAllTemplates);
app.post('/api/templates', authMiddleware, templateController.createTemplate);
app.put('/api/templates/:id', authMiddleware, templateController.updateTemplate);
app.delete('/api/templates/:id', authMiddleware, templateController.deleteTemplate);

// --- PROTECTED SETTINGS ROUTES ---
app.get('/api/settings/forwarding', authMiddleware, settingsController.getForwardingRules);
app.post('/api/settings/forwarding', authMiddleware, settingsController.createForwardingRule);
app.get('/api/settings/groups', authMiddleware, settingsController.getGroupSettings);
app.post('/api/settings/groups', authMiddleware, settingsController.updateGroupSetting);

const HOST = '0.0.0.0';
const PORT = process.env.PORT || 5000;
server.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
    whatsappController.init();
});