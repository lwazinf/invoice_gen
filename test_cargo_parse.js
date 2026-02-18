import pdf from 'pdf-parse';
import fs from 'fs';

const pdfPath = './instructions/TrpInstruction_78418__Sasinelwa_wheat_5_2_2026.pdf';
const dataBuffer = fs.readFileSync(pdfPath);
const pdfData = await pdf(dataBuffer);

console.log('=== RAW PDF TEXT ===');
console.log(pdfData.text);
console.log('\n=== SEARCHING FOR CARGO ===');

// Look for cargo table
const lines = pdfData.text.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('Wheat') || line.includes('Fertilizer') || line.includes('Millscale')) {
    console.log(`Line ${idx}: ${line}`);
  }
});
