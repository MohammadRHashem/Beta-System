const { Queue } = require('bullmq');

const connection = {
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null
};

// Define and export the queue so other modules can use the exact same instance.
const broadcastQueue = new Queue('broadcast-queue', { connection });

module.exports = broadcastQueue;