require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io"); // Import the socket.io Server class

const whatsappController = require('./controllers/whatsappController');
const batchController = require('./controllers/batchController');
const templateController = require('./controllers/templateController');

const app = express();
const server = http.createServer(app);

// Initialize socket.io server with CORS policy
const io = new Server(server, {
    cors: {
        origin: "https://beta.hashemlabs.dev", // In production, you might restrict this to your domain
        methods: ["GET", "POST"]
    }
});

app.use(cors({
    origin: "https://beta.hashemlabs.dev",
}));
app.use(express.json());

// Socket.io connection logic
io.on('connection', (socket) => {
    console.log(`[Socket.io] A user connected with ID: ${socket.id}`);
    
    // Pass the io and socket instances to the controller so it can emit events
    // This makes the 'io' instance available to all requests via req.io
    app.use((req, res, next) => {
        req.io = io;
        req.socket = socket;
        next();
    });

    socket.on('disconnect', () => {
        console.log(`[Socket.io] User disconnected with ID: ${socket.id}`);
    });
});

// --- API Routes ---
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