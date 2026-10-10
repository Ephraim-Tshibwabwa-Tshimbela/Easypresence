import { parentPort, workerData } from 'node:worker_threads';
import { generateExcelExport, generatePdfExport } from './exportService.js';

try {
  const { type, filter, title, session } = workerData;
  let buffer;

  if (type === 'pdf') {
    buffer = generatePdfExport(filter, title, session);
  } else if (type === 'excel') {
    buffer = generateExcelExport(filter, session);
  } else {
    throw new Error(`Type d'export inconnu : ${type}`);
  }

  parentPort.postMessage({ success: true, buffer });
} catch (err) {
  parentPort.postMessage({
    success: false,
    error: err.message || 'Erreur inconnue lors de la génération de l\'export.',
    stack: err.stack
  });
}
