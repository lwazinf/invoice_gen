#!/usr/bin/env node
/**
 * SASINELWA Invoice System - CLI Tool
 * Generate invoices from command line
 * 
 * Usage:
 *   node src/cli.js --pdf ./instructions/document.pdf
 *   node src/cli.js --manual --client "ENSIGN SHIPPING" --rate 550 --tons 35
 */

import fs from 'fs';
import path from 'path';
import { parseTransportInstruction } from './parser.js';
import { generateInvoice, processTransportInstruction } from './generator.js';

// Parse command line arguments
const args = process.argv.slice(2);

function printUsage() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           SASINELWA INVOICE GENERATOR                         ║
╚═══════════════════════════════════════════════════════════════╝

Usage:
  node src/cli.js [options]

Options:
  --pdf <path>          Process a transport instruction PDF
  --manual              Create invoice manually with the following options:
    --client <name>     Client name (required)
    --rate <number>     Rate per ton in Rands (required)
    --tons <number>     Total tonnage (required)
    --order <number>    Transport order number
    --file <string>     File number
    --date <string>     Delivery date (DD/MM/YYYY)
    --vehicle <string>  Vehicle registration
    --cargo <string>    Cargo description
    --from <string>     Collection point
    --to <string>       Delivery point
  
  --output <dir>        Output directory (default: ./invoices)
  --help                Show this help message

Examples:
  # Process a PDF transport instruction
  node src/cli.js --pdf ./instructions/TrpInstruction_88311.pdf

  # Create invoice manually
  node src/cli.js --manual \\
    --client "ENSIGN SHIPPING AND LOGISTICS (PTY) LTD" \\
    --rate 550 \\
    --tons 35 \\
    --order 9625 \\
    --file ESL9632 \\
    --vehicle DDR829NC \\
    --cargo "1 CHROME" \\
    --from "WINDSOR 6" \\
    --to "BULK CONNECTIONS"
`);
}

async function main() {
  if (args.includes('--help') || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const outputDir = getArg('--output') || './invoices';

  // Process PDF mode
  if (args.includes('--pdf')) {
    const pdfPath = getArg('--pdf');
    
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      console.error('❌ Error: PDF file not found:', pdfPath);
      process.exit(1);
    }

    console.log('📄 Parsing transport instruction:', pdfPath);
    
    try {
      const instruction = await parseTransportInstruction(pdfPath);
      
      console.log('\n📋 Extracted Data:');
      console.log('   Company:', instruction.issuingCompany);
      console.log('   Transport Order:', instruction.transportOrder);
      console.log('   File Number:', instruction.fileNumber);
      console.log('   Rate:', `R${instruction.ratePerTon} per ton`);
      console.log('   Cargo Lines:', instruction.cargoLines.length);
      
      console.log('\n⚙️  Generating invoices...\n');
      
      const invoices = await processTransportInstruction(instruction, outputDir);
      
      console.log('\n✅ Generated Invoices:');
      for (const inv of invoices) {
        console.log(`   📄 ${inv.filename}`);
        console.log(`      Amount: R${inv.amounts.total.toFixed(2)}`);
      }
      
    } catch (error) {
      console.error('❌ Error processing PDF:', error.message);
      process.exit(1);
    }
  }
  
  // Manual mode
  else if (args.includes('--manual')) {
    const client = getArg('--client');
    const rate = parseFloat(getArg('--rate'));
    const tons = parseFloat(getArg('--tons'));

    if (!client || isNaN(rate) || isNaN(tons)) {
      console.error('❌ Error: --client, --rate, and --tons are required for manual mode');
      printUsage();
      process.exit(1);
    }

    const invoiceData = {
      clientName: client,
      ratePerTon: rate,
      quantity: tons,
      transportOrder: getArg('--order') || '',
      fileNumber: getArg('--file') || '',
      deliveryDate: getArg('--date') || '',
      vehicleReg: getArg('--vehicle') || '',
      cargoDescription: getArg('--cargo') || '1 CARGO',
      collectionPoint: getArg('--from') || '',
      deliveryPoint: getArg('--to') || ''
    };

    console.log('⚙️  Generating invoice...\n');
    
    try {
      const result = await generateInvoice(invoiceData, outputDir);
      
      console.log('✅ Invoice Generated Successfully!\n');
      console.log(`   📄 File: ${result.filename}`);
      console.log(`   📍 Path: ${result.path}`);
      console.log(`   💰 Excl VAT: R${result.amounts.excl.toFixed(2)}`);
      console.log(`   💰 VAT: R${result.amounts.vat.toFixed(2)}`);
      console.log(`   💰 Total: R${result.amounts.total.toFixed(2)}`);
      
    } catch (error) {
      console.error('❌ Error generating invoice:', error.message);
      process.exit(1);
    }
  }
  
  else {
    console.error('❌ Error: Unknown command');
    printUsage();
    process.exit(1);
  }
}

function getArg(name) {
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return null;
}

main().catch(console.error);
