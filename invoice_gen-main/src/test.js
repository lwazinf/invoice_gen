/**
 * SASINELWA Invoice System - Test Script
 * Tests invoice generation with sample data
 */

import { generateInvoice } from './generator.js';

async function test() {
  console.log('🧪 Testing SASINELWA Invoice Generator...\n');

  // Test data matching your actual invoice format
  const testData = {
    clientName: 'ENSIGN SHIPPING AND LOGISTICS (PTY) LTD',
    transportOrder: '9625',
    fileNumber: 'ESL9632',
    deliveryDate: '17/01/2026',
    vehicleReg: 'DDR829NC',
    collectionPoint: 'WINDSOR 6',
    deliveryPoint: 'BULK CONNECTIONS',
    cargoDescription: '1 CHROME',
    ratePerTon: 550,
    quantity: 35
  };

  console.log('📋 Test Invoice Data:');
  console.log('   Client:', testData.clientName);
  console.log('   Rate:', `R${testData.ratePerTon} per ton`);
  console.log('   Quantity:', testData.quantity, 'tons');
  console.log('   Expected Total:', `R${(testData.ratePerTon * testData.quantity * 1.15).toFixed(2)}`);
  console.log('');

  try {
    const result = await generateInvoice(testData, './invoices');
    
    console.log('✅ Test Passed!\n');
    console.log('📄 Generated Invoice:');
    console.log('   Number:', result.invoiceNumber);
    console.log('   File:', result.filename);
    console.log('   Path:', result.path);
    console.log('');
    console.log('💰 Amounts:');
    console.log('   Excl VAT: R', result.amounts.excl.toFixed(2));
    console.log('   VAT (15%): R', result.amounts.vat.toFixed(2));
    console.log('   Total: R', result.amounts.total.toFixed(2));
    console.log('');
    console.log('🎉 Open the PDF to verify the invoice looks correct!');
    
  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
