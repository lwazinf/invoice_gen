/**
 * SASINELWA Invoice System - PDF Parser
 * Extracts data from Ensign transport instruction PDFs
 */

import fs from 'fs';
import pdf from 'pdf-parse';

/**
 * Parse a transport instruction PDF and extract invoice data
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<Object>} Parsed transport instruction data
 */
export async function parseTransportInstruction(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdf(dataBuffer);
  const text = pdfData.text;

  // Extract fields using regex patterns
  const instruction = {
    // Header info
    issuingCompany: extractIssuingCompany(text),
    
    // Transport details
    transportOrder: extractField(text, /Transport Order\s*[:#]?\s*(\d+)/i),
    fileNumber: extractField(text, /File Number\s*[:#]?\s*([A-Z0-9]+)/i),
    date: extractField(text, /Date\s*[:#]?\s*([\d\-\/]+)/i),
    instructionDate: extractField(text, /Date\s*[:#]?\s*([\d\-\/]+)/i),
    
    // Vehicle info
    vehicleReg: extractField(text, /Vehicle Registration\s*[:#]?\s*([A-Z0-9]+)/i) ||
                extractField(text, /DDR\d+[A-Z]+/i),
    driverName: extractField(text, /Driver Name\s*[:#]?\s*([^\n]+)/i),
    
    // Rate
    ratePerTon: extractRate(text),
    
    // Locations
    collectionName: extractField(text, /Collection[^:]*Name\s*[:#]?\s*([^\n]+)/i),
    collectionAddress: extractField(text, /Collection[^:]*Address\s*[:#]?\s*([^\n]+)/i),
    collectionDate: extractField(text, /Collection[^:]*Date\/Time\s*[:#]?\s*([\d\-\s:\/]+)/i),
    
    deliveryName: extractField(text, /Delivery[^:]*Name\s*[:#]?\s*([^\n]+)/i),
    deliveryAddress: extractField(text, /Delivery[^:]*Address\s*[:#]?\s*([^\n]+)/i),
    deliveryDate: extractField(text, /Delivery[^:]*Date\/Time\s*[:#]?\s*([\d\-\s:\/]+[^\n]*)/i),
    
    // Cargo details
    cargoLines: extractCargoLines(text),
    
    // Special instructions
    specialInstructions: extractField(text, /SPECIAL INSTRUCTIONS\s*([\s\S]*?)(?=\n\n|$)/i),
    
    // Raw text for debugging
    rawText: text
  };

  return instruction;
}

/**
 * Extract the issuing company name
 */
function extractIssuingCompany(text) {
  if (text.includes('ENSIGN SHIPPING')) {
    return 'ENSIGN SHIPPING AND LOGISTICS (PTY) LTD';
  }
  if (text.includes('ELETHU')) {
    return 'ELETHU LOGISTICS (PTY) LTD';
  }
  return extractField(text, /^([A-Z\s]+(?:PTY|LTD|LIMITED)[^\n]*)/im) || 'Unknown Company';
}

/**
 * Extract a single field using regex
 */
function extractField(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Extract the rate per ton
 */
function extractRate(text) {
  // Look for patterns like "R550 PER TON" or "Transporter Instruction: R520 PER TON"
  const patterns = [
    /Transporter Instruction\s*[:#]?\s*R(\d+(?:\.\d{2})?)\s*PER\s*TON/i,
    /R(\d+(?:\.\d{2})?)\s*PER\s*TON/i,
    /Rate\s*[:#]?\s*R?(\d+(?:\.\d{2})?)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1]);
    }
  }
  return 0;
}

/**
 * Extract cargo lines from the table
 */
function extractCargoLines(text) {
  const cargoLines = [];

  console.log(`   🔍 Searching for cargo in PDF...`);

  const lines = text.split('\n');

  let inCargoSection = false;
  const cargoKeywords = ['Wheat', 'Millscale', 'Fertilizer', 'Maize', 'Chrome',
                         'Sunflower', 'Coal', 'Iron', 'Steel', 'Ore', 'Slag', 'Soya'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes('Cargo Details') || line.includes('Cargo Descriptions')) {
      inCargoSection = true;
      console.log(`   ✅ Found Cargo Details section`);
      continue;
    }

    if (line.includes('Vehicle Reg') || line.includes('Special Details')) {
      continue;
    }

    if (inCargoSection) {
      for (const keyword of cargoKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        
        if (regex.test(line)) {
          const vehicleMatch = line.match(/\b(\d{6})\b/);
          const tonsMatch = line.match(/(\d+\.\d{3})/);
          
          if (vehicleMatch && tonsMatch) {
            cargoLines.push({
              cargo: `1 ${keyword}`,
              description: keyword,
              vehicleReg: vehicleMatch[1],
              tons: parseFloat(tonsMatch[1]),
              cbm: 0
            });
            console.log(`   ✅ Extracted: "${keyword}" - ${vehicleMatch[1]} - ${tonsMatch[1]} tons`);
          }
          break;
        }
      }

      if (line.includes('SPECIAL INSTRUCTIONS') || line.includes('02/02/2026')) {
        inCargoSection = false;
        break;
      }
    }
  }

  if (cargoLines.length === 0) {
    console.log(`   ⚠️  Cargo Details section empty, searching entire document...`);
    
    for (const keyword of cargoKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = text.match(regex);
      
      if (matches && matches.length >= 2) {
        const vehicleMatches = text.match(/\b(\d{6})\b/g);
        const tonsMatches = text.match(/(\d+\.\d{3})\s+0\.000/g);
        
        if (tonsMatches) {
          tonsMatches.forEach((t, i) => {
            const tons = parseFloat(t.split(/\s+/)[0]);
            cargoLines.push({
              cargo: `1 ${keyword}`,
              description: keyword,
              vehicleReg: vehicleMatches ? vehicleMatches[i] : '',
              tons: tons,
              cbm: 0
            });
          });
          console.log(`   ✅ Found via document search: "${keyword}"`);
          break;
        }
      }
    }
  }

  if (cargoLines.length === 0) {
    console.log(`   ❌ No cargo type found, using "Cargo" as fallback`);
    const tonsMatches = text.match(/(\d+\.\d{3})\s+0\.000/g);
    if (tonsMatches) {
      cargoLines.push({
        cargo: 'Cargo',
        description: 'Cargo',
        vehicleReg: '',
        tons: parseFloat(tonsMatches[0]),
        cbm: 0
      });
    }
  }

  return cargoLines;
}

/**
 * Extract delivery dates from special instructions
 */
export function extractDeliveryDates(text) {
  const dates = [];
  const datePattern = /(\d{2}\/\d{2}\/\d{4})\s+([A-Z0-9]+)/g;

  let match;
  while ((match = datePattern.exec(text)) !== null) {
    dates.push({
      date: match[1],
      reference: match[2]
    });
  }

  return dates;
}

export default { parseTransportInstruction, extractDeliveryDates };
