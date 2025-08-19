require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
require('./services/broadcastWorker');

const whatsappController = require('./controllers/whatsappController');
const batchController = require('./controllers/batchController');
const templateController = require('./controllers/templateController');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    path: "/socket.io/",
    cors: {
        origin: "https://beta.hashemlabs.dev",
        methods: ["GET", "POST"]
    }
});

app.use(cors({
    origin: "https://beta.hashemlabs.dev"
}));

app.use(express.json());

// --- THIS IS THE CRITICAL FIX ---
// The middleware is now defined globally.
// It attaches the main 'io' server instance to every single request.
app.use((req, res, next) => {
    req.io = io;
    next();
});

// The connection event is now only for logging and potential future per-socket logic.
io.on('connection', (socket) => {
    console.log(`[Socket.io] A user connected with ID: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`[Socket.io] User disconnected with ID: ${socket.id}`);
    });
});


// --- API Routes ---
// Now every route below this line will have access to req.io
app.get('/api/status', whatsappController.getStatus);
app.get('/api/qr', whatsappController.getQRCode);
app.post('/api/logout', whatsappController.logout);

app.get('/api/groups', whatsappController.getGroups);
app.post('/api/groups/sync', whatsappController.syncGroups);

app.post('/api/broadcast', whatsappController.broadcastMessage);

app.get('/api/batches', batchController.getAllBatches);
app.get('/api/batches/:id', batchController.getGroupIdsByBatch);
app.post('/api/batches', batchController.createBatch);
app.put('/api/batches/:id', batchController.updateBatch);
app.delete('/api/batches/:id', batchController.deleteBatch);

app.get('/api/templates', templateController.getAllTemplates);
app.post('/api/templates', templateController.createTemplate);
app.put('/api/templates/:id', templateController.updateTemplate);
app.delete('/api/templates/:id', templateController.deleteTemplate);

const HOST = '0.0.0.0';
const PORT = process.env.PORT || 5000;
server.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
    whatsappController.init();
});