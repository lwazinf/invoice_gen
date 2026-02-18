/**
 * Initialize data files if they don't exist
 * Called automatically on first run
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');

export function initializeDataFiles() {
  // Create data directory if it doesn't exist
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  // Initialize invoice_metadata.json
  const metadataFile = path.join(DATA_DIR, 'invoice_metadata.json');
  if (!fs.existsSync(metadataFile)) {
    fs.writeFileSync(metadataFile, JSON.stringify({ invoices: {} }, null, 2));
  }
  
  // Initialize invoice_sequence.json
  const sequenceFile = path.join(DATA_DIR, 'invoice_sequence.json');
  if (!fs.existsSync(sequenceFile)) {
    fs.writeFileSync(sequenceFile, JSON.stringify({ lastNumber: 0 }, null, 2));
  }
  
  // Initialize pending_matches.json
  const pendingFile = path.join(DATA_DIR, 'pending_matches.json');
  if (!fs.existsSync(pendingFile)) {
    fs.writeFileSync(pendingFile, JSON.stringify({ pending: [] }, null, 2));
  }
  
  // Initialize matched_pairs.json
  const matchedFile = path.join(DATA_DIR, 'matched_pairs.json');
  if (!fs.existsSync(matchedFile)) {
    fs.writeFileSync(matchedFile, JSON.stringify({ matches: [] }, null, 2));
  }
}
