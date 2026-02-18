#!/usr/bin/env node
/**
 * SASINELWA Invoice System v5.0 - Manual Weighbridge Entry
 * For processing weighbridge images manually
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { 
  getPendingInvoices, 
  removePendingInvoice,
  recordMatch,
  calculateMatchConfidence
} from './matcher.js';
import { regenerateInvoiceWithActualTonnage } from './generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WEIGHBRIDGE_DIR = path.join(__dirname, '..', 'weighbridge');
const WEIGHBRIDGE_UNMATCHED = path.join(WEIGHBRIDGE_DIR, 'unmatched');
const WEIGHBRIDGE_MATCHED = path.join(WEIGHBRIDGE_DIR, 'matched');

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
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         MANUAL WEIGHBRIDGE ENTRY v5.0                         ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Loop until all invoices are processed or user exits
  while (true) {
    // Get pending invoices
    let pending = getPendingInvoices();
    
    if (pending.length === 0) {
      console.log('✅ No pending invoices. All invoices are confirmed!\n');
      return;
    }

    // Sort by instruction date (oldest first, latest last)
    pending = pending.sort((a, b) => {
      const dateA = new Date(a.instructionDate || '2000-01-01');
      const dateB = new Date(b.instructionDate || '2000-01-01');
      return dateA - dateB; // Ascending order (oldest first)
    });

    console.log(`⏳ ${pending.length} Pending Invoice(s) (sorted by date, oldest first):\n`);
    pending.forEach((inv, idx) => {
      console.log(`   ${idx + 1}. Invoice #${String(inv.invoiceNumber).padStart(3, '0')}`);
      console.log(`      📅 Instruction Date: ${inv.instructionDate || 'N/A'}`);
      console.log(`      📦 Cargo: ${inv.cargo || inv.description || 'N/A'}`);
      console.log(`      🚛 Vehicle: ${inv.vehicleReg}`);
      console.log(`      📍 Delivery: ${inv.deliveryPoint || 'N/A'}`);
      console.log(`      ⚖️  Instruction Qty: ${inv.quantity} tons`);
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Ask which invoice to update (or exit)
    const invoiceNumStr = await prompt('Which invoice number do you want to update? (or "q" to quit): ');
    
    // Check for quit
    if (invoiceNumStr.toLowerCase().trim() === 'q') {
      console.log('\n👋 Exiting manual entry. Remaining invoices still pending.\n');
      return;
    }
    
    // Remove any non-numeric characters
    const cleanInput = invoiceNumStr.replace(/[^0-9]/g, '');
    
    if (!cleanInput) {
      console.log('\n❌ Invalid invoice number\n');
      continue; // Go back to menu instead of exiting
    }

  // Try to find invoice - compare as both string and number
  const invoice = pending.find(inv => {
    const invNum = String(inv.invoiceNumber);
    return invNum === cleanInput || 
           invNum === cleanInput.padStart(3, '0') ||
           parseInt(invNum) === parseInt(cleanInput);
  });
  
  if (!invoice) {
    console.log(`\n❌ Invoice not found`);
    console.log(`\nAvailable invoices: ${pending.map(i => i.invoiceNumber).join(', ')}`);
    console.log(`\nTry entering one of the numbers above (e.g., ${pending[0]?.invoiceNumber})\n`);
    continue; // Go back to menu instead of exiting
  }

  const invoiceNum = invoice.invoiceNumber;

  console.log(`\n📋 Updating Invoice #${String(invoiceNum).padStart(3, '0')}\n`);
  console.log(`   Current (Instruction) Tonnage: ${invoice.quantity} tons`);
  console.log(`   Cargo Description: ${invoice.description || invoice.cargo || 'Not specified'}`);
  console.log(`   Delivery Destination: ${invoice.deliveryPoint || 'Not specified'}`);
  console.log(`   Delivery Date: ${invoice.deliveryDate || 'Not specified'}\n`);
  
  // Verify cargo description with options
  const cargoOptions = [
    'Wheat',
    'Millscale', 
    'Fertilizer',
    'Maize',
    'Chrome',
    'Sunflower',
    'Coal',
    'Iron',
    'Steel',
    'Ore',
    'Slag',
    'Soya',
    'Other'
  ];
  
  console.log('Cargo Description: ' + (invoice.description || invoice.cargo || 'Not specified'));
  console.log('  [Enter] = Accept current');
  console.log('  [1-13] = Choose from list:');
  cargoOptions.forEach((option, idx) => {
    console.log(`    ${idx + 1}. ${option}`);
  });
  
  const cargoChoice = await prompt('Your choice: ');
  let finalCargo;
  
  if (!cargoChoice.trim()) {
    // Accept current
    finalCargo = invoice.description || invoice.cargo || 'Cargo';
  } else if (!isNaN(parseInt(cargoChoice)) && parseInt(cargoChoice) >= 1 && parseInt(cargoChoice) <= cargoOptions.length) {
    // Selected from list
    const selectedIndex = parseInt(cargoChoice) - 1;
    if (selectedIndex === cargoOptions.length - 1) {
      // "Other" selected - ask for custom input
      const customCargo = await prompt('Enter cargo type: ');
      finalCargo = customCargo.trim() || (invoice.description || invoice.cargo || 'Cargo');
    } else {
      finalCargo = cargoOptions[selectedIndex];
    }
    console.log(`   ✏️  Cargo updated to: "${finalCargo}"`);
  } else {
    // Direct text input
    finalCargo = cargoChoice.trim();
    console.log(`   ✏️  Cargo updated to: "${finalCargo}"`);
  }

  // Verify delivery destination
  console.log(`\nDelivery Destination: ${invoice.deliveryPoint || 'Not specified'}`);
  const destinationInput = await prompt('Press Enter if correct, or type the actual destination: ');
  const finalDestination = destinationInput.trim() || invoice.deliveryPoint || 'N/A';
  
  if (destinationInput.trim()) {
    console.log(`   ✏️  Destination updated to: "${finalDestination}"`);
  }
  
  // Verify delivery date
  console.log(`\nDelivery Date: ${invoice.deliveryDate || 'Not specified'}`);
  const dateInput = await prompt('Press Enter if correct, or type the actual date (YYYY-MM-DD): ');
  const finalDate = dateInput.trim() || invoice.deliveryDate || '';
  
  if (dateInput.trim()) {
    console.log(`   ✏️  Date updated to: "${finalDate}"`);
  }

  // Ask for actual tonnage
  console.log('');
  const actualTonsStr = await prompt('Enter actual tonnage from weighbridge (e.g., 35.32): ');
  const actualTons = parseFloat(actualTonsStr);

  if (isNaN(actualTons) || actualTons <= 0) {
    console.log('\n❌ Invalid tonnage\n');
    continue; // Go back to menu instead of exiting
  }

  // Calculate variance
  const instructionTons = invoice.quantity;
  const difference = actualTons - instructionTons;
  const percentDiff = ((difference / instructionTons) * 100).toFixed(2);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📊 Tonnage Comparison:`);
  console.log(`   Instruction:  ${instructionTons.toFixed(2)} tons`);
  console.log(`   Actual:       ${actualTons.toFixed(2)} tons`);
  console.log(`   Variance:     ${difference >= 0 ? '+' : ''}${difference.toFixed(2)} tons (${difference >= 0 ? '+' : ''}${percentDiff}%)`);
  console.log('');

  // Ask for weighbridge ticket number (optional)
  const ticketNum = await prompt('Weighbridge ticket number (optional, press Enter to skip): ');

  // Confirm (default is YES - just press Enter)
  const confirm = await prompt('\nConfirm update? ([Y]/n): ');
  
  // Empty or 'y' or 'Y' = yes, anything else = no
  if (confirm.trim() && confirm.toLowerCase() !== 'y') {
    console.log('\n❌ Update cancelled\n');
    continue; // Go back to menu instead of exiting
  }

  // Record the match
  recordMatch(invoiceNum, {
    ticketNumber: ticketNum || 'MANUAL',
    vehicleReg: invoice.vehicleReg,
    nettWeight: actualTons * 1000 // Convert to kg for consistency
  }, {
    instructionQty: instructionTons,
    actualQty: actualTons,
    difference: difference,
    percentDiff: parseFloat(percentDiff),
    confidence: 100 // Manual entry = 100% confidence
  });

  // Remove from pending
  removePendingInvoice(invoiceNum);
  
  console.log('\n🔄 Regenerating invoice with updated information...\n');
  
  try {
    // Regenerate PDF with actual tonnage, cargo, destination, and date
    const invoicesDir = path.join(__dirname, '../invoices');
    const result = await regenerateInvoiceWithActualTonnage(invoiceNum, actualTons, invoicesDir, finalCargo, finalDestination, finalDate);
    
    console.log('\n✅ Invoice updated successfully!\n');
    console.log(`   Invoice #${String(invoiceNum).padStart(3, '0')} is now FINAL`);
    console.log(`   Destination: ${finalDestination}`);
    console.log(`   Delivery Date: ${finalDate}`);
    console.log(`   Cargo: ${finalCargo}`);
    console.log(`   Actual Tonnage: ${actualTons.toFixed(2)} tons`);
    console.log(`   Variance: ${difference >= 0 ? '+' : ''}${difference.toFixed(2)} tons (${difference >= 0 ? '+' : ''}${percentDiff}%)`);
    console.log('');
    console.log(`   💰 New Total: R${result.amounts.total.toFixed(2)}`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('\n❌ Error regenerating invoice:', error.message);
    console.log('   Invoice data recorded but PDF not updated\n');
  }
  
  // Loop continues to show remaining pending invoices
  } // End of while loop
}

// Export for use by process.js
export async function runManualEntry() {
  return main();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}
