#!/usr/bin/env node
/**
 * Clear pending matches - Use when you need to reset and regenerate invoices
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PENDING_MATCHES_FILE = path.join(__dirname, '../data/pending_matches.json');

// Clear pending matches
fs.writeFileSync(PENDING_MATCHES_FILE, JSON.stringify({ invoices: [] }, null, 2));

console.log('✅ Pending matches cleared!');
console.log('\nNext steps:');
console.log('1. Move invoices back to instructions/');
console.log('2. Run: npm run process');
console.log('3. Then run: npm run manual\n');
