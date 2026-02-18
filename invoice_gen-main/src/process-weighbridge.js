#!/usr/bin/env node
/**
 * SASINELWA Invoice System v5.0 - Weighbridge Processor
 * 
 * Usage:
 *   npm run weighbridge
 * 
 * Processes weighbridge tickets and matches them with pending invoices
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseWeighbridgePDF, kgToTons, formatWeight } from './weighbridge-parser.js';
import { 
  getPendingInvoices, 
  removePendingInvoice,
  findBestMatch,
  recordMatch
} from './matcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WEIGHBRIDGE_DIR = path.join(__dirname, '..', 'weighbridge');
const WEIGHBRIDGE_MATCHED = path.join(WEIGHBRIDGE_DIR, 'matched');
const WEIGHBRIDGE_UNMATCHED = path.join(WEIGHBRIDGE_DIR, 'unmatched');

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         SASINELWA WEIGHBRIDGE PROCESSOR v5.0                  ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Ensure directories exist
  if (!fs.existsSync(WEIGHBRIDGE_DIR)) {
    fs.mkdirSync(WEIGHBRIDGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(WEIGHBRIDGE_MATCHED)) {
    fs.mkdirSync(WEIGHBRIDGE_MATCHED, { recursive: true });
  }
  if (!fs.existsSync(WEIGHBRIDGE_UNMATCHED)) {
    fs.mkdirSync(WEIGHBRIDGE_UNMATCHED, { recursive: true });
  }

  // Find weighbridge PDFs and images
  const allFiles = fs.readdirSync(WEIGHBRIDGE_DIR)
    .filter(f => {
      const ext = f.toLowerCase();
      return ext.endsWith('.pdf') || 
             ext.endsWith('.jpg') || 
             ext.endsWith('.jpeg') || 
             ext.endsWith('.png');
    })
    .map(f => path.join(WEIGHBRIDGE_DIR, f));

  if (allFiles.length === 0) {
    console.log('📁 No weighbridge tickets found in ./weighbridge folder\n');
    console.log('   To process weighbridge tickets:');
    console.log('   1. Drop weighbridge PDFs or images into the ./weighbridge folder');
    console.log('   2. Run: npm run weighbridge\n');
    
    // Show pending invoices
    const pending = getPendingInvoices();
    if (pending.length > 0) {
      console.log(`⏳ Pending Invoices Awaiting Weighbridge Confirmation: ${pending.length}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      pending.forEach(inv => {
        console.log(`   #${String(inv.invoiceNumber).padStart(3, '0')} - ${inv.vehicleReg} - ${inv.deliveryPoint}`);
      });
      console.log('');
    }
    return;
  }

  console.log(`📄 Found ${allFiles.length} weighbridge ticket(s) to process\n`);

  // Get pending invoices
  const pendingInvoices = getPendingInvoices();
  console.log(`⏳ ${pendingInvoices.length} pending invoice(s) awaiting confirmation\n`);

  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const filePath of allFiles) {
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📄 Processing: ${filename}`);
    
    try {
      let weighbridge;
      
      // Check if it's an image or PDF
      if (ext === '.pdf') {
        // Parse PDF
        weighbridge = await parseWeighbridgePDF(filePath);
      } else if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
        // For images, we'll do manual extraction from the image data
        // Since we can't do OCR without tesseract, we'll use a simpler approach
        console.log(`   ℹ️  Image file detected - manual data entry required`);
        console.log(`   Please convert image to PDF or use manual matching`);
        console.log('');
        
        // Move to unmatched for manual processing
        const unmatchedPath = path.join(WEIGHBRIDGE_UNMATCHED, filename);
        fs.renameSync(filePath, unmatchedPath);
        unmatchedCount++;
        continue;
      }
      
      // Parse weighbridge ticket
      
      console.log(`   🎯 Matching with pending invoices...`);
      console.log('');
      console.log(`   Weighbridge Data:`);
      console.log(`   - Ticket: ${weighbridge.ticketNumber || 'N/A'}`);
      console.log(`   - Vehicle: ${weighbridge.vehicleReg || 'N/A'}`);
      console.log(`   - Location: ${weighbridge.location || 'N/A'}`);
      console.log(`   - Date: ${weighbridge.date || 'N/A'}`);
      console.log(`   - Nett Weight: ${weighbridge.nettWeight ? formatWeight(weighbridge.nettWeight) + ' tons' : 'N/A'}`);
      console.log('');

      // Try to find a match
      const match = findBestMatch(weighbridge, pendingInvoices);

      if (match && match.status === 'STRONG_MATCH') {
        console.log(`   ✅ MATCH FOUND! (${match.confidence}% confidence)`);
        console.log('');
        console.log(`   Invoice #${String(match.invoice.invoiceNumber).padStart(3, '0')} ↔️ Weighbridge #${weighbridge.ticketNumber}`);
        console.log('');
        
        // Display match reasons
        match.reasons.forEach(reason => console.log(`   ${reason}`));
        console.log('');

        // Calculate tonnage variance
        const instructionTons = match.invoice.quantity;
        const actualTons = weighbridge.nettWeight / 1000;
        const difference = actualTons - instructionTons;
        const percentDiff = ((difference / instructionTons) * 100).toFixed(2);

        console.log(`   📊 Tonnage Comparison:`);
        console.log(`   Instruction:  ${instructionTons.toFixed(2)} tons`);
        console.log(`   Actual:       ${actualTons.toFixed(2)} tons`);
        console.log(`   Variance:     ${difference >= 0 ? '+' : ''}${difference.toFixed(2)} tons (${difference >= 0 ? '+' : ''}${percentDiff}%)`);
        console.log('');

        // Calculate amount update
        const originalAmount = match.invoice.quantity * (match.invoice.ratePerTon || 0);
        const newAmount = actualTons * (match.invoice.ratePerTon || 0);
        const amountDiff = newAmount - originalAmount;

        console.log(`   💰 Amount Update:`);
        console.log(`   Before:  R${originalAmount.toFixed(2)}`);
        console.log(`   After:   R${newAmount.toFixed(2)}`);
        console.log(`   Change:  ${amountDiff >= 0 ? '+' : ''}R${amountDiff.toFixed(2)}`);
        console.log('');

        // Record the match
        recordMatch(match.invoice.invoiceNumber, weighbridge, {
          instructionQty: instructionTons,
          actualQty: actualTons,
          difference: difference,
          percentDiff: parseFloat(percentDiff),
          confidence: match.confidence
        });

        // Remove from pending
        removePendingInvoice(match.invoice.invoiceNumber);

        // Move to matched folder
        const matchedPath = path.join(WEIGHBRIDGE_MATCHED, filename);
        fs.renameSync(filePath, matchedPath);
        
        console.log(`   ✅ Invoice updated with actual tonnage`);
        console.log(`   📦 Moved to: ./weighbridge/matched/`);
        
        matchedCount++;

      } else if (match && match.status === 'POSSIBLE_MATCH') {
        console.log(`   ⚠️  POSSIBLE MATCH (${match.confidence}% confidence)`);
        console.log('');
        console.log(`   Invoice #${String(match.invoice.invoiceNumber).padStart(3, '0')} might match`);
        console.log('');
        match.reasons.forEach(reason => console.log(`   ${reason}`));
        console.log('');
        console.log(`   ℹ️  Manual verification recommended`);
        console.log(`   📦 Moved to: ./weighbridge/unmatched/`);
        
        // Move to unmatched for manual review
        const unmatchedPath = path.join(WEIGHBRIDGE_UNMATCHED, filename);
        fs.renameSync(filePath, unmatchedPath);
        unmatchedCount++;

      } else {
        console.log(`   ❌ NO MATCH FOUND`);
        console.log('');
        console.log(`   Possible reasons:`);
        console.log(`   1. Invoice not yet generated`);
        console.log(`   2. Vehicle registration mismatch`);
        console.log(`   3. Date outside matching window (±5 days)`);
        console.log(`   4. Location doesn't match`);
        console.log('');
        console.log(`   📝 Action Required:`);
        console.log(`   - Check if transport instruction received`);
        console.log(`   - Verify vehicle registration`);
        console.log(`   - Use manual matching if needed`);
        console.log('');
        console.log(`   📦 Moved to: ./weighbridge/unmatched/`);
        
        // Move to unmatched
        const unmatchedPath = path.join(WEIGHBRIDGE_UNMATCHED, filename);
        fs.renameSync(filePath, unmatchedPath);
        unmatchedCount++;
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      unmatchedCount++;
    }
    
    console.log('');
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`
📊 Summary:
   ✅ Matched: ${matchedCount} ticket(s)
   ⚠️  Unmatched: ${unmatchedCount} ticket(s)
   ⏳ Still Pending: ${getPendingInvoices().length} invoice(s)
`);
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
