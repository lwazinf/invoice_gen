/**
 * SASINELWA Invoice System v5.0 - Weighbridge Parser
 * Parses weighbridge tickets and delivery notes to extract actual tonnage
 */

import pdfParse from 'pdf-parse';
import fs from 'fs';

/**
 * Parse weighbridge ticket PDF
 * @param {string} filePath - Path to weighbridge PDF
 * @returns {object} Parsed weighbridge data
 */
export async function parseWeighbridgePDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    const text = pdfData.text;

    // Extract data using regex patterns
    const weighbridgeData = {
      ticketNumber: extractTicketNumber(text),
      vehicleReg: extractVehicleReg(text),
      nettWeight: extractNettWeight(text),
      grossWeight: extractGrossWeight(text),
      tareWeight: extractTareWeight(text),
      location: extractLocation(text),
      date: extractDate(text),
      customer: extractCustomer(text),
      product: extractProduct(text),
      driver: extractDriver(text),
      documentType: 'weighbridge',
      rawText: text // Keep for debugging
    };

    return weighbridgeData;

  } catch (error) {
    console.error('❌ Error parsing weighbridge PDF:', error.message);
    throw error;
  }
}

/**
 * Extract ticket/document number
 */
function extractTicketNumber(text) {
  const patterns = [
    /WB\s*Ticket\s*#?\s*:?\s*(\d+)/i,
    /Ticket\s*No\.?\s*:?\s*(\d+)/i,
    /Document\s*Number\s*:?\s*(\d+)/i,
    /No\s*(\d{5,})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Extract vehicle registration
 */
function extractVehicleReg(text) {
  const patterns = [
    /Truck\s*Reg\.?\s*:?\s*([A-Z]{2,3}\s?\d{2,4}\s?[A-Z]{2,3})/i,
    /Vehicle\s*:?\s*([A-Z]{2,3}\s?\d{2,4}\s?[A-Z]{2,3})/i,
    /Registration\s*:?\s*([A-Z]{2,3}\s?\d{2,4}\s?[A-Z]{2,3})/i,
    /([A-Z]{2,3}\s?\d{3,4}\s?[A-Z]{2})/  // DDR829NC, DDR 829 NC
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Normalize: remove spaces
      return match[1].replace(/\s+/g, '').toUpperCase();
    }
  }
  return null;
}

/**
 * Extract nett weight in kg
 */
function extractNettWeight(text) {
  const patterns = [
    /Nett\s*Weight\s*:?\s*(\d+(?:,\d+)?(?:\.\d+)?)\s*kg/i,
    /Net\s*\(kg\)\s*:?\s*(\d+(?:,\d+)?)/i,
    /Total\s*Nett\s*\(kg\)\s*:?\s*(\d+(?:,\d+)?)/i,
    /Nett\s*:?\s*(\d+(?:,\d+)?)\s*kg/i,
    /Nett\s*Weight\s*(\d+(?:,\d+)?)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Remove commas and convert to number
      const weight = parseFloat(match[1].replace(/,/g, ''));
      return weight;
    }
  }
  return null;
}

/**
 * Extract gross weight in kg
 */
function extractGrossWeight(text) {
  const patterns = [
    /Gross\s*Weight\s*:?\s*(\d+(?:,\d+)?)\s*kg/i,
    /Gross\s*\(kg\)\s*:?\s*(\d+(?:,\d+)?)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }
  return null;
}

/**
 * Extract tare weight in kg
 */
function extractTareWeight(text) {
  const patterns = [
    /Tare\s*Weight\s*:?\s*(\d+(?:,\d+)?)\s*kg/i,
    /Tare\s*\(kg\)\s*:?\s*(\d+(?:,\d+)?)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }
  return null;
}

/**
 * Extract location/destination
 */
function extractLocation(text) {
  const patterns = [
    /Zone\s*:?\s*([^\n]+)/i,
    /Location\s*:?\s*([^\n]+)/i,
    /(Maydon\s*Wharf[^\n]*)/i,
    /(SASKO[^\n]*)/i,
    /(KRUGERSDORP[^\n]*)/i,
    /(KYNOCH[^\n]*)/i,
    /(ENDICOTT[^\n]*)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract date
 */
function extractDate(text) {
  const patterns = [
    /(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/,  // 2026/02/10 08:01:58
    /(\d{4}\/\d{2}\/\d{2})/,  // 2026/02/10
    /(\d{2}\/\d{2}\/\d{4})/,  // 10/02/2026
    /(\d{4}-\d{2}-\d{2})/     // 2026-02-10
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract customer name
 */
function extractCustomer(text) {
  const patterns = [
    /Client\s*Name\s*:?\s*([^\n]+)/i,
    /Customer\s*:?\s*([^\n]+)/i,
    /Haulier\s*:?\s*([^\n]+)/i,
    /(ENSIGN|ELETHU|SATL|SILO)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract product/cargo
 */
function extractProduct(text) {
  const patterns = [
    /Product\s*:?\s*([^\n]+)/i,
    /Cargo\s*:?\s*([^\n]+)/i,
    /(MILL\s*SCALE|WHEAT|UREA|CEMENT|FLOUR)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Extract driver name
 */
function extractDriver(text) {
  const patterns = [
    /Driver\s*Name\s*:?\s*([^\n]+)/i,
    /Driver\s*:?\s*([^\n]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Convert kg to tons
 */
export function kgToTons(kg) {
  return kg / 1000;
}

/**
 * Format weight for display
 */
export function formatWeight(kg) {
  const tons = kgToTons(kg);
  return tons.toFixed(2);
}
