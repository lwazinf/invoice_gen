#!/usr/bin/env node
/**
 * SASINELWA Invoice System - Simple Processor
 * 
 * Usage:
 *   npm run process                    - Process PDFs, will ask for starting invoice number if not set
 *   npm run process 100                - Process PDFs, start numbering at 100
 *   npm run process 100 1.15           - Process PDFs, start at 100, apply 15% scale
 *   npm run process --set 50           - Just set the starting number to 50 (no processing)
 * 
 * Scale parameter: Optional multiplier for tonnage (e.g., 1.15 = +15%, 0.9 = -10%)
 * 
 * It will:
 * 1. Look for PDFs in ./instructions folder
 * 2. Parse each transport instruction
 * 3. Generate invoices in ./invoices folder
 * 4. Move processed PDFs to ./instructions/processed
 * 5. Automatically open manual update menu
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { parseTransportInstruction } from './parser.js';
import { processTransportInstruction, getCurrentInvoiceNumber, setInvoiceNumber } from './generator.js';
import { parseWeighbridgePDF, kgToTons } from './weighbridge-parser.js';
import { 
  addPendingInvoice, 
  getPendingInvoices, 
  removePendingInvoice,
  findBestMatch,
  recordMatch,
  calculateMatchConfidence
} from './matcher.js';
import { initializeDataFiles } from './init-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INSTRUCTIONS_DIR = path.join(__dirname, '..', 'instructions');
const PROCESSED_DIR = path.join(INSTRUCTIONS_DIR, 'processed');
const INVOICES_DIR = path.join(__dirname, '..', 'invoices');
const WEIGHBRIDGE_DIR = path.join(__dirname, '..', 'weighbridge');
const WEIGHBRIDGE_MATCHED = path.join(WEIGHBRIDGE_DIR, 'matched');
const WEIGHBRIDGE_UNMATCHED = path.join(WEIGHBRIDGE_DIR, 'unmatched');

/**
 * Prompt user for input
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  // Initialize data files on first run
  initializeDataFiles();
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           SASINELWA INVOICE PROCESSOR                         ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Parse command line arguments
  const args = process.argv.slice(2);
  
  // Check for --set flag (just set number, don't process)
  if (args.includes('--set')) {
    const setIndex = args.indexOf('--set');
    const newNumber = parseInt(args[setIndex + 1]);
    
    if (isNaN(newNumber) || newNumber < 1) {
      console.log('❌ Please provide a valid invoice number after --set');
      console.log('   Example: npm run process --set 100');
      return;
    }
    
    setInvoiceNumber(newNumber);
    console.log(`\n✅ Next invoice will be: #${String(newNumber).padStart(3, '0')}`);
    return;
  }

  // Starting invoice number is REQUIRED
  let startingNumber = null;
  let scaleMultiplier = null;
  
  if (args.length > 0 && !isNaN(parseInt(args[0]))) {
    startingNumber = parseInt(args[0]);
  }
  
  // Check for scale parameter (second argument)
  if (args.length > 1 && !isNaN(parseFloat(args[1]))) {
    scaleMultiplier = parseFloat(args[1]);
    console.log(`📊 Scale factor applied: ${scaleMultiplier}x (${scaleMultiplier > 1 ? '+' : ''}${((scaleMultiplier - 1) * 100).toFixed(1)}%)\n`);
  }

  // If no starting number provided, show error
  if (startingNumber === null) {
    console.log('❌ Starting invoice number is required!\n');
    console.log('Usage:');
    console.log('  npm run process <invoice_number> [scale]\n');
    console.log('Examples:');
    console.log('  npm run process 1              # Start at invoice #001');
    console.log('  npm run process 100            # Start at invoice #100');
    console.log('  npm run process 16 1.15        # Start at #016 with +15% scale');
    console.log('  npm run process 50 0.9         # Start at #050 with -10% scale\n');
    return;
  }

  // Set the starting number
  setInvoiceNumber(startingNumber);
  console.log(`✅ Invoice numbering will start at: #${String(startingNumber).padStart(3, '0')}\n`);

  // Ensure directories exist
  if (!fs.existsSync(INSTRUCTIONS_DIR)) {
    fs.mkdirSync(INSTRUCTIONS_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }
  if (!fs.existsSync(INVOICES_DIR)) {
    fs.mkdirSync(INVOICES_DIR, { recursive: true });
  }
  if (!fs.existsSync(WEIGHBRIDGE_DIR)) {
    fs.mkdirSync(WEIGHBRIDGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(WEIGHBRIDGE_MATCHED)) {
    fs.mkdirSync(WEIGHBRIDGE_MATCHED, { recursive: true });
  }
  if (!fs.existsSync(WEIGHBRIDGE_UNMATCHED)) {
    fs.mkdirSync(WEIGHBRIDGE_UNMATCHED, { recursive: true });
  }

  // Start overall timer
  const overallStartTime = Date.now();

  // Find all PDFs in instructions folder
  const pdfFiles = fs.readdirSync(INSTRUCTIONS_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(INSTRUCTIONS_DIR, f));

  if (pdfFiles.length === 0) {
    console.log('📁 No PDF files found in ./instructions folder\n');
    console.log('   To generate invoices:');
    console.log('   1. Drop transport instruction PDFs into the ./instructions folder');
    console.log('   2. Run: npm run process\n');
    return;
  }

  console.log(`📄 Found ${pdfFiles.length} PDF(s) to process`);
  console.log(`🔍 Parsing instruction dates to sort by chronological order...\n`);
  
  // Parse all PDFs to get their instruction dates
  const pdfData = [];
  for (const pdfPath of pdfFiles) {
    try {
      const instruction = await parseTransportInstruction(pdfPath);
      pdfData.push({
        path: pdfPath,
        filename: path.basename(pdfPath),
        instructionDate: instruction.date || instruction.instructionDate || '2000-01-01',
        instruction: instruction
      });
    } catch (error) {
      console.log(`⚠️  Warning: Could not parse ${path.basename(pdfPath)}: ${error.message}`);
    }
  }
  
  // Sort by instruction date (oldest first)
  pdfData.sort((a, b) => {
    const dateA = new Date(a.instructionDate);
    const dateB = new Date(b.instructionDate);
    return dateA - dateB;
  });
  
  console.log(`✅ PDFs sorted by instruction date (oldest → newest)\n`);

  let totalInvoices = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const pdf of pdfData) {
    const filename = pdf.filename;
    const instruction = pdf.instruction;
    
    // Start timer for this file
    const startTime = Date.now();
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📄 Processing: ${filename}`);
    console.log(`   📅 Instruction Date: ${pdf.instructionDate}`);
    
    try {
      console.log(`   📋 Company: ${instruction.issuingCompany}`);
      console.log(`   📋 Order: ${instruction.transportOrder || 'N/A'}`);
      console.log(`   📋 Rate: R${instruction.ratePerTon || 'N/A'} per ton`);
      
      // Generate invoices
      const invoices = await processTransportInstruction(instruction, INVOICES_DIR);
      
      // Calculate time taken
      const endTime = Date.now();
      const timeTaken = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log(`   ✅ Generated ${invoices.length} invoice${invoices.length > 1 ? 's' : ''} from this instruction (${timeTaken}s):`);
      for (const inv of invoices) {
        console.log(`      💰 #${inv.invoiceNumber} - R${inv.amounts.total.toFixed(2)}`);
        totalInvoices++;
        
        const tonnage = scaleMultiplier ? (inv.quantity || 35) * scaleMultiplier : (inv.quantity || 35);
        
        if (scaleMultiplier) {
          console.log(`      📊 Scaled: ${inv.quantity || 35} → ${tonnage.toFixed(2)} tons`);
        }
        
        // Add to pending matches (awaiting weighbridge confirmation)
        addPendingInvoice({
          invoiceNumber: inv.invoiceNumber,
          transportOrder: instruction.transportOrder,
          vehicleReg: instruction.vehicleReg,
          deliveryPoint: inv.deliveryPoint || instruction.deliveryName || 'N/A',
          deliveryDate: instruction.deliveryDate || instruction.date,
          instructionDate: instruction.date || instruction.instructionDate,
          quantity: tonnage,
          originalQuantity: inv.quantity || 35,
          ratePerTon: instruction.ratePerTon,
          clientName: instruction.issuingCompany,
          cargo: inv.cargoDescription || 'Cargo',
          description: inv.cargoDescription || 'Cargo'
        });
      }
      
      console.log(`   ℹ️  Status: PRELIMINARY (awaiting weighbridge confirmation)`);
      
      // Move processed PDF
      const processedPath = path.join(PROCESSED_DIR, filename);
      fs.renameSync(pdf.path, processedPath);
      console.log(`   📦 Moved to: ./instructions/processed/`);
      
      successCount++;
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      errorCount++;
    }
    
    console.log('');
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  // Calculate total time
  const overallEndTime = Date.now();
  const totalTime = ((overallEndTime - overallStartTime) / 1000).toFixed(2);
  
  console.log(`
📊 Summary:
   ✅ Processed: ${successCount} file(s)
   ❌ Errors: ${errorCount} file(s)
   🧾 Invoices Generated: ${totalInvoices}
   ⏱️  Total Time: ${totalTime}s
   
📁 Invoices saved to: ./invoices/
`);

  // Check if there are pending invoices to update
  const pending = getPendingInvoices();
  if (pending.length > 0) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`
⏳ ${pending.length} invoice(s) pending manual update
🔄 Opening manual update menu...
`);
    
    // Dynamic import and run manual entry
    const { runManualEntry } = await import('./manual-entry.js');
    await runManualEntry();
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
