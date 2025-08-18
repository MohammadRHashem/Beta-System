require('dotenv').config();
const batchController = require('./controllers/batchController');
const templateController = require('./controllers/templateController');
const express = require('express');
const cors = require('cors');
const http = require('http');
const whatsappController = require('./controllers/whatsappController');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// --- API Routes ---
app.get('/api/status', whatsappController.getStatus);
app.get('/api/qr', whatsappController.getQRCode);
app.post('/api/logout', whatsappController.logout);
app.get('/api/groups', whatsappController.getGroups); // Now reads from DB
app.post('/api/groups/sync', whatsappController.syncGroups); // New sync endpoint
app.post('/api/broadcast', whatsappController.broadcastMessage);
app.get('/api/batches', batchController.getAllBatches);
app.get('/api/batches/:id', batchController.getGroupIdsByBatch);
app.post('/api/batches', batchController.createBatch);
app.get('/api/templates', templateController.getAllTemplates);
app.post('/api/templates', templateController.createTemplate);
app.put('/api/batches/:id', batchController.updateBatch);
app.delete('/api/batches/:id', batchController.deleteBatch);
app.put('/api/templates/:id', templateController.updateTemplate);
app.delete('/api/templates/:id', templateController.deleteTemplate);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
    whatsappController.init();
});