const { Worker } = require('bullmq');
const baileysService = require('./baileys');

const connection = {
    host: 'localhost',
    port: 6379,
    // Add this to prevent client connection errors in some environments
    maxRetriesPerRequest: null 
};

// The Worker's job is to process jobs and report progress.
const worker = new Worker('broadcast-queue', async job => {
    // We only need the core data now
    const { socketId, groupObjects, message } = job.data;
    
    console.log(`[WORKER] Processing broadcast job ${job.id} for socket ${socketId}`);

    // This is a custom function we will create inside the Baileys service
    // It will report progress back to the job itself.
    const progressReporter = async (progress) => {
        await job.updateProgress(progress);
    };

    // The broadcast function now accepts the reporter
    await baileysService.broadcast(progressReporter, groupObjects, message);
    
    console.log(`[WORKER] Finished processing job ${job.id}`);
}, { connection });

console.log('Broadcast worker started.');

worker.on('failed', (job, err) => {
    console.error(`[WORKER-ERROR] Job ${job.id} failed with error: ${err.message}`);
});