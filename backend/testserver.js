const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 5001; // Use a different port to not interfere with your main app

app.use(cors());
app.use(express.json());

// A simple router for the portal endpoint
const portalRouter = express.Router();

portalRouter.post('/auth/login', (req, res) => {
    console.log(`[TEST SERVER] Received POST request on /portal/auth/login`);
    console.log('Body:', req.body);
    res.status(200).json({ message: 'POST request received successfully by test server!' });
});

// A GET route for basic testing
portalRouter.get('/status', (req, res) => {
    res.status(200).json({ status: 'Test server is running' });
});

app.use('/portal', portalRouter);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TEST SERVER] Minimal test server listening on http://0.0.0.0:${PORT}`);
});