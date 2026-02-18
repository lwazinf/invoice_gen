/**
 * Invoice Metadata Manager
 * Stores invoice data for later regeneration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const METADATA_FILE = path.join(__dirname, '../data/invoice_metadata.json');

/**
 * Save invoice metadata
 */
export function saveInvoiceMetadata(invoiceNumber, invoiceData) {
  let metadata = { invoices: {} };
  
  if (fs.existsSync(METADATA_FILE)) {
    const data = fs.readFileSync(METADATA_FILE, 'utf8');
    metadata = JSON.parse(data);
  }
  
  metadata.invoices[invoiceNumber] = {
    ...invoiceData,
    savedAt: new Date().toISOString()
  };
  
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
}

/**
 * Get invoice metadata
 */
export function getInvoiceMetadata(invoiceNumber) {
  if (!fs.existsSync(METADATA_FILE)) {
    return null;
  }
  
  const data = fs.readFileSync(METADATA_FILE, 'utf8');
  const metadata = JSON.parse(data);
  
  return metadata.invoices[invoiceNumber] || null;
}

/**
 * Get all invoice metadata
 */
export function getAllInvoiceMetadata() {
  if (!fs.existsSync(METADATA_FILE)) {
    return {};
  }
  
  const data = fs.readFileSync(METADATA_FILE, 'utf8');
  const metadata = JSON.parse(data);
  
  return metadata.invoices || {};
}
