// ============================================================================
// Glean RAG Assistant - Standalone Ingestion Script
// ============================================================================
// Simple wrapper script to trigger document ingestion from the command line.
// Usage: npm run ingest
// ============================================================================

import { ingestDocuments } from './ingest.js';

(async () => {
  try {
    console.log('Glean RAG Assistant - Document Ingestion\n');

    await ingestDocuments();

    console.log('\nIngestion complete');
    process.exit(0);

  } catch (error) {
    console.error('\nIngestion failed:', error.message);
    process.exit(1);
  }
})();
