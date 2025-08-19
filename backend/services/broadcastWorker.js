const { Worker } = require('bullmq');
const baileysService = require('./baileys'); // We'll need access to the broadcast logic

const connection = {
    host: 'localhost',
    port: 6379
};

// The Worker's job is to process jobs from the queue, one by one.
const worker = new Worker('broadcast-queue', async job => {
    // The job.data contains everything we need
    const { io, socketId, groupObjects, message } = job.data;
    
    console.log(`[WORKER] Processing broadcast job ${job.id} for socket ${socketId}`);

    // We pass the job data to our existing robust broadcast function.
    // The key is that the worker `await`s this, so it will not
    // pick up a new job until this entire broadcast is finished.
    await baileysService.broadcast(io, socketId, groupObjects, message);
    
    console.log(`[WORKER] Finished processing job ${job.id}`);
}, { connection });

console.log('Broadcast worker started.');

worker.on('failed', (job, err) => {
    console.error(`[WORKER-ERROR] Job ${job.id} failed with error: ${err.message}`);
});