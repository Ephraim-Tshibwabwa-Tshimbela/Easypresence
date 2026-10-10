import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workerPath = path.resolve(__dirname, '../src/server/exportWorker.js');

console.log('Testing Worker thread PDF generation...');
const t0 = performance.now();

const worker = new Worker(workerPath, {
  workerData: {
    type: 'pdf',
    filter: 'all',
    title: 'TEST PDF EN WORKER THREAD',
    session: 'all'
  }
});

worker.on('message', (msg) => {
  const duration = (performance.now() - t0).toFixed(2);
  if (msg.success) {
    console.log(`Worker SUCCESS! Buffer length: ${msg.buffer.byteLength || msg.buffer.length} bytes in ${duration} ms`);
    process.exit(0);
  } else {
    console.error('Worker failed with message:', msg.error, msg.stack);
    process.exit(1);
  }
});

worker.on('error', (err) => {
  console.error('Worker thread threw uncaught error:', err);
  process.exit(1);
});
