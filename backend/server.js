// =============================================================
// == BARE MINIMUM SERVER.JS - v3 - FOR DEFINITIVE DEBUGGING ==
// =============================================================
console.log("--- RUNNING DEBUGGING SERVER V3 ---");

require('dotenv').config();
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);

// A single, simple test route
app.get('/', (req, res) => {
    res.send('Bare minimum server is running!');
});

const HOST = '0.0.0.0';
const PORT = process.env.PORT || 5000;
server.listen(PORT, HOST, () => {
    console.log(`Server is running successfully on http://${HOST}:${PORT}`);
    console.log("If you see this message, the basic server works. Now we can find the real problem.");
});