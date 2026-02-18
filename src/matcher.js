/**
 * SASINELWA Invoice System v5.0 - Document Matcher
 * Matches transport instructions with weighbridge tickets
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PENDING_MATCHES_FILE = path.join(__dirname, '../data/pending_matches.json');
const MATCHED_PAIRS_FILE = path.join(__dirname, '../data/matched_pairs.json');

/**
 * Fuzzy string matching (Levenshtein-based similarity)
 */
function fuzzyMatch(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const s2 = str2.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // Calculate Levenshtein distance
  const matrix = [];
  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  const distance = matrix[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - (distance / maxLength);
}

/**
 * Normalize vehicle registration
 */
function normalizeVehicleReg(reg) {
  if (!reg) return '';
  return reg.toUpperCase().replace(/\s+/g, '');
}

/**
 * Check if dates are within range
 */
function isDateWithinRange(date1, date2, days = 5) {
  if (!date1 || !date2) return false;
  
  try {
    // Handle various date formats
    const d1 = new Date(date1.replace(/\//g, '-'));
    const d2 = new Date(date2.replace(/\//g, '-').split(' ')[0]); // Remove time if present
    
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays <= days;
  } catch (error) {
    console.error('Date parsing error:', error);
    return false;
  }
}

/**
 * Calculate match confidence score
 */
export function calculateMatchConfidence(invoiceData, weighbridgeData) {
  let confidence = 0;
  const reasons = [];

  // 1. Vehicle Registration (40 points - critical)
  if (invoiceData.vehicleReg && weighbridgeData.vehicleReg) {
    const v1 = normalizeVehicleReg(invoiceData.vehicleReg);
    const v2 = normalizeVehicleReg(weighbridgeData.vehicleReg);
    
    if (v1 === v2) {
      confidence += 40;
      reasons.push('✓ Vehicle match: ' + v1);
    } else {
      reasons.push('✗ Vehicle mismatch: ' + v1 + ' ≠ ' + v2);
    }
  }

  // 2. Location Match (30 points - high priority)
  if (invoiceData.deliveryPoint && weighbridgeData.location) {
    const locationSimilarity = fuzzyMatch(invoiceData.deliveryPoint, weighbridgeData.location);
    if (locationSimilarity >= 0.7) {
      const points = Math.round(30 * locationSimilarity);
      confidence += points;
      reasons.push(`✓ Location match (${Math.round(locationSimilarity * 100)}%)`);
    } else {
      reasons.push(`✗ Location mismatch`);
    }
  }

  // 3. Date Range (20 points)
  if (invoiceData.deliveryDate && weighbridgeData.date) {
    if (isDateWithinRange(invoiceData.deliveryDate, weighbridgeData.date, 5)) {
      confidence += 20;
      reasons.push('✓ Date within range (±5 days)');
    } else {
      reasons.push('✗ Date outside range');
    }
  }

  // 4. Client Name (5 points - validation)
  if (invoiceData.clientName && weighbridgeData.customer) {
    const clientSimilarity = fuzzyMatch(invoiceData.clientName, weighbridgeData.customer);
    if (clientSimilarity >= 0.6) {
      confidence += 5;
      reasons.push('✓ Client match');
    }
  }

  // 5. Tonnage Range (5 points - sanity check)
  if (invoiceData.quantity && weighbridgeData.nettWeight) {
    const instructionTons = invoiceData.quantity;
    const actualTons = weighbridgeData.nettWeight / 1000;
    const variance = Math.abs((actualTons - instructionTons) / instructionTons);
    
    if (variance <= 0.15) { // Within 15%
      confidence += 5;
      reasons.push(`✓ Tonnage within range (${(variance * 100).toFixed(1)}% variance)`);
    } else {
      reasons.push(`⚠ Tonnage variance high (${(variance * 100).toFixed(1)}%)`);
    }
  }

  return {
    confidence,
    reasons,
    status: confidence >= 70 ? 'STRONG_MATCH' : 
            confidence >= 50 ? 'POSSIBLE_MATCH' : 'NO_MATCH'
  };
}

/**
 * Find best match for weighbridge ticket
 */
export function findBestMatch(weighbridgeData, pendingInvoices) {
  let bestMatch = null;
  let highestConfidence = 0;

  for (const invoice of pendingInvoices) {
    const result = calculateMatchConfidence(invoice, weighbridgeData);
    
    if (result.confidence > highestConfidence) {
      highestConfidence = result.confidence;
      bestMatch = {
        invoice,
        ...result
      };
    }
  }

  return bestMatch;
}

/**
 * Add invoice to pending matches
 */
export function addPendingInvoice(invoiceData) {
  try {
    let pending = { invoices: [] };
    
    if (fs.existsSync(PENDING_MATCHES_FILE)) {
      const data = fs.readFileSync(PENDING_MATCHES_FILE, 'utf8');
      pending = JSON.parse(data);
    }

    pending.invoices.push({
      ...invoiceData,
      status: 'awaiting_weighbridge',
      createdAt: new Date().toISOString()
    });

    fs.writeFileSync(PENDING_MATCHES_FILE, JSON.stringify(pending, null, 2));
    
  } catch (error) {
    console.error('❌ Error adding pending invoice:', error.message);
  }
}

/**
 * Get all pending invoices
 */
export function getPendingInvoices() {
  try {
    if (!fs.existsSync(PENDING_MATCHES_FILE)) {
      return [];
    }
    
    const data = fs.readFileSync(PENDING_MATCHES_FILE, 'utf8');
    const pending = JSON.parse(data);
    return pending.invoices || [];
    
  } catch (error) {
    console.error('❌ Error reading pending invoices:', error.message);
    return [];
  }
}

/**
 * Remove invoice from pending (after match)
 */
export function removePendingInvoice(invoiceNumber) {
  try {
    if (!fs.existsSync(PENDING_MATCHES_FILE)) return;
    
    const data = fs.readFileSync(PENDING_MATCHES_FILE, 'utf8');
    const pending = JSON.parse(data);
    
    pending.invoices = pending.invoices.filter(inv => inv.invoiceNumber !== invoiceNumber);
    
    fs.writeFileSync(PENDING_MATCHES_FILE, JSON.stringify(pending, null, 2));
    
  } catch (error) {
    console.error('❌ Error removing pending invoice:', error.message);
  }
}

/**
 * Record successful match
 */
export function recordMatch(invoiceNumber, weighbridgeData, variance) {
  try {
    let matched = { matches: [] };
    
    if (fs.existsSync(MATCHED_PAIRS_FILE)) {
      const data = fs.readFileSync(MATCHED_PAIRS_FILE, 'utf8');
      matched = JSON.parse(data);
    }

    matched.matches.push({
      invoiceNumber,
      weighbridgeTicket: weighbridgeData.ticketNumber,
      vehicleReg: weighbridgeData.vehicleReg,
      instructionQty: variance.instructionQty,
      actualQty: variance.actualQty,
      variance: variance.difference,
      variancePercent: variance.percentDiff,
      matchedAt: new Date().toISOString(),
      confidence: variance.confidence
    });

    fs.writeFileSync(MATCHED_PAIRS_FILE, JSON.stringify(matched, null, 2));
    
  } catch (error) {
    console.error('❌ Error recording match:', error.message);
  }
}

/**
 * Get match history
 */
export function getMatchHistory() {
  try {
    if (!fs.existsSync(MATCHED_PAIRS_FILE)) {
      return [];
    }
    
    const data = fs.readFileSync(MATCHED_PAIRS_FILE, 'utf8');
    const matched = JSON.parse(data);
    return matched.matches || [];
    
  } catch (error) {
    console.error('❌ Error reading match history:', error.message);
    return [];
  }
}
