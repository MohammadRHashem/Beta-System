require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');

// --- Middleware ---
const authMiddleware = require('./middleware/authMiddleware'); // For Admin Panel
const portalAuthMiddleware = require('./middleware/portalAuthMiddleware'); // For Client Portal

// --- Route Files ---
const portalRoutes = require('./routes/portalRoutes');
const adminApiRoutes = require('./routes/adminApiRoutes'); // We will create this new file

const manualReviewController = require('./controllers/manualReviewController');

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

// --- Global Setup ---
app.set('io', io); // Make io accessible in controllers via req.app.get('io')
app.use(cors({
    origin: [productionFrontendUrlWithPort, productionFrontendUrl],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

io.on('connection', (socket) => {
    console.log(`[Socket.io] User connected: ${socket.id}`);
    socket.on('disconnect', () => { console.log(`[Socket.io] User disconnected: ${socket.id}`); });
});


// --- ROUTE DEFINITIONS ---

// 1. Public Portal Routes (Login)
// We will now handle the login route directly here for clarity.
const portalController = require('./controllers/portalController');
app.post('/portal/auth/login', portalController.login);

app.post('/portal/bridge/confirm-payment', portalAuthMiddleware, portalController.triggerPartnerConfirmation);


// 2. Protected Portal Routes
// All routes from portalRoutes will be prefixed with /portal AND will use the portalAuthMiddleware.
app.use('/portal', portalAuthMiddleware, portalRoutes);

// 3. Public Admin Routes (Login/Register)
const authController = require('./controllers/authController');
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);

// 4. Protected Admin Routes
// All routes from adminApiRoutes will be prefixed with /api AND will use the admin authMiddleware.
app.use('/api', authMiddleware, adminApiRoutes);


// --- Static Frontend Hosting ---
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendPath)) {
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

    const broadcastScheduler = require('./services/broadcastScheduler');
    broadcastScheduler.initialize(io);
});