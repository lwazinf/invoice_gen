/**
 * SASINELWA Invoice System v4.0 - Invoice Generator
 * Generates professional PDF invoices using Puppeteer
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import Mustache from 'mustache';
import dotenv from 'dotenv';
import { saveInvoiceMetadata } from './invoice-metadata.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Company configuration from environment
const COMPANY_CONFIG = {
  name: process.env.COMPANY_NAME || 'SASINELWA (PTY) Ltd.',
  regNumber: process.env.COMPANY_REG || '2023/191021/07',
  vatNumber: process.env.COMPANY_VAT || '4740319340',
  phone: process.env.COMPANY_PHONE || '082 569 5593',
  address: process.env.COMPANY_ADDRESS || '58 Ophelia Street',
  city: process.env.COMPANY_CITY || 'Herlear, Kimberley',
  postalCode: process.env.COMPANY_POSTAL_CODE || '8301',
  email: process.env.COMPANY_EMAIL || 'Ndlovud22@gmail.com'
};

// Bank details from environment
const BANK_CONFIG = {
  name: process.env.BANK_NAME || 'Capitec',
  branch: process.env.BANK_BRANCH || 'Relationship Suite',
  code: process.env.BANK_CODE || '450105',
  accountNumber: process.env.BANK_ACCOUNT_NUMBER || '1051802806',
  accountType: process.env.BANK_ACCOUNT_TYPE || 'Capitec Business Account'
};

// Known client details (for auto-filling address info)
const KNOWN_CLIENTS = {
  'ENSIGN SHIPPING AND LOGISTICS (PTY) LTD': {
    address: 'One on Lunar, 1D Umhlanga Ridge Boulevard, Lunar Row,<br>Umhlanga New Town Centre,<br>Umhlanga, 4319',
    vatNumber: '4600165072',
    regNumber: '1996/003581/07'
  },
  'ELETHU LOGISTICS (PTY) LTD': {
    address: 'One on Lunar, 1D Umhlanga Ridge,<br>Umhlanga New Town Centre,<br>Umhlanga Rocks, Kwa-Zulu Natal, 4319',
    vatNumber: '4660322803',
    regNumber: '2025/427310/07'
  },
  'ELETHU BULK (PTY) LTD': {
    address: 'One on Lunar, 1D Umhlanga Ridge,<br>Umhlanga New Town Centre,<br>Umhlanga Rocks, Kwa-Zulu Natal, 4319',
    vatNumber: '4660322803',
    regNumber: '2025/427310/07'
  }
};

// VAT rate from environment
const VAT_RATE = parseFloat(process.env.VAT_RATE || '0.15');

// Invoice number sequence
let invoiceSequence = 1;
const SEQUENCE_FILE = path.join(__dirname, '..', 'data', 'invoice_sequence.json');

/**
 * Load invoice sequence from file
 */
function loadSequence() {
  try {
    if (fs.existsSync(SEQUENCE_FILE)) {
      const data = JSON.parse(fs.readFileSync(SEQUENCE_FILE, 'utf-8'));
      invoiceSequence = data.lastNumber || 1;
    }
  } catch (error) {
    console.log('Starting with default sequence:', invoiceSequence);
  }
}

/**
 * Save invoice sequence to file
 */
function saveSequence() {
  const dir = path.dirname(SEQUENCE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SEQUENCE_FILE, JSON.stringify({ lastNumber: invoiceSequence }, null, 2));
}

/**
 * Set the starting invoice number
 */
export function setInvoiceNumber(number) {
  invoiceSequence = parseInt(number) - 1; // -1 because getNextInvoiceNumber will increment
  saveSequence();
  console.log(`✅ Invoice numbering will start at: #${String(number).padStart(3, '0')}`);
}

/**
 * Get current invoice number (without incrementing)
 */
export function getCurrentInvoiceNumber() {
  loadSequence();
  return invoiceSequence;
}

/**
 * Get next invoice number
 */
export function getNextInvoiceNumber() {
  loadSequence();
  invoiceSequence++;
  saveSequence();
  return String(invoiceSequence).padStart(3, '0');
}

/**
 * Format number as currency (South African Rand)
 */
function formatCurrency(amount) {
  return amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Convert image to base64 data URI
 */
function imageToBase64(imagePath) {
  if (!fs.existsSync(imagePath)) {
    console.warn(`Image not found: ${imagePath}`);
    return '';
  }
  const imageBuffer = fs.readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).toLowerCase().slice(1);
  const mimeType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Get client details from known clients database
 */
function getClientDetails(clientName) {
  // Try exact match first
  if (KNOWN_CLIENTS[clientName]) {
    return KNOWN_CLIENTS[clientName];
  }
  
  // Try partial match
  for (const [name, details] of Object.entries(KNOWN_CLIENTS)) {
    if (clientName.toUpperCase().includes(name.split(' ')[0].toUpperCase())) {
      return details;
    }
  }
  
  return null;
}

/**
 * Generate invoice HTML from template
 */
export function generateInvoiceHTML(invoiceData) {
  // Load template
  const templatePath = path.join(__dirname, 'templates', 'invoice.html');
  const template = fs.readFileSync(templatePath, 'utf-8');

  // Calculate amounts
  const amountExcl = invoiceData.quantity * invoiceData.ratePerTon;
  const vatAmount = amountExcl * VAT_RATE;
  const totalAmount = amountExcl + vatAmount;

  // Prepare assets paths
  const assetsDir = path.join(__dirname, '..', 'assets');
  
  // Get client details
  const clientDetails = getClientDetails(invoiceData.clientName);
  
  // Prepare template data
  const data = {
    // Invoice details
    invoiceNumber: invoiceData.invoiceNumber || getNextInvoiceNumber(),
    invoiceDate: invoiceData.invoiceDate || new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }),
    
    // Transport details
    transportOrder: invoiceData.transportOrder || '',
    fileNumber: invoiceData.fileNumber || '',
    instructionDate: invoiceData.instructionDate || '',
    deliveryDate: invoiceData.deliveryDate || '',
    vehicleReg: invoiceData.vehicleReg || '',
    
    // Client info
    clientName: invoiceData.clientName || '',
    clientAddress: invoiceData.clientAddress || (clientDetails ? clientDetails.address : ''),
    clientVat: invoiceData.clientVat || (clientDetails ? clientDetails.vatNumber : ''),
    clientReg: invoiceData.clientReg || (clientDetails ? clientDetails.regNumber : ''),
    
    // Route
    collectionPoint: invoiceData.collectionPoint || '',
    deliveryPoint: invoiceData.deliveryPoint || '',
    
    // Cargo
    cargoDescription: invoiceData.cargoDescription || '',
    rateDisplay: `R${invoiceData.ratePerTon} PER TON`,
    quantity: invoiceData.quantity || 0,
    
    // Calculated amounts
    amountExclFormatted: formatCurrency(amountExcl),
    vatAmountFormatted: formatCurrency(vatAmount),
    totalAmountFormatted: formatCurrency(totalAmount),
    
    // Company info
    company: COMPANY_CONFIG,
    
    // Bank info
    bank: BANK_CONFIG,
    
    // Assets (as base64 data URIs for PDF embedding)
    logoPath: imageToBase64(path.join(assetsDir, 'logo.png')),
    icons: {
      phone: imageToBase64(path.join(assetsDir, 'phone.png')),
      email: imageToBase64(path.join(assetsDir, 'email.png')),
      pin: imageToBase64(path.join(assetsDir, 'pin.png'))
    }
  };

  // Render template
  const html = Mustache.render(template, data);
  
  return {
    html,
    invoiceNumber: data.invoiceNumber,
    amounts: {
      excl: amountExcl,
      vat: vatAmount,
      total: totalAmount
    }
  };
}

/**
 * Generate PDF from HTML using Puppeteer
 */
export async function generatePDF(html, outputPath) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    timeout: 300000 // 5 minutes for browser launch
  });

  try {
    const page = await browser.newPage();
    
    // Set page timeout to 5 minutes
    page.setDefaultTimeout(300000);
    
    // Set content with longer timeout
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 300000 // 5 minutes for content loading
    });

    // Generate PDF
    await page.pdf({
  path: outputPath,
  format: 'A4',
  printBackground: true,
  scale: 0.8,  // ← Magic! Shrinks everything to 75% size
  margin: {
    top: '10mm',
    right: '10mm',
    bottom: '10mm',
    left: '10mm'
  }
});

    console.log(`✅ PDF generated: ${outputPath}`);
    return outputPath;
  } finally {
    await browser.close();
  }
}

/**
 * Generate invoice from data and save as PDF
 */
export async function generateInvoice(invoiceData, outputDir = './invoices') {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate HTML
  const { html, invoiceNumber, amounts } = generateInvoiceHTML(invoiceData);

  // Generate filename
  const filename = `Invoice_${invoiceNumber}.pdf`;
  const outputPath = path.join(outputDir, filename);

  // Generate PDF
  await generatePDF(html, outputPath);
  
  // Save invoice metadata for later regeneration
  saveInvoiceMetadata(invoiceNumber, invoiceData);

  return {
    invoiceNumber,
    filename,
    path: outputPath,
    amounts,
    quantity: invoiceData.quantity,
    deliveryPoint: invoiceData.deliveryPoint
  };
}

/**
 * Process transport instruction and generate invoices
 */
export async function processTransportInstruction(instruction, outputDir = './invoices') {
  const generatedInvoices = [];
  const invoiceDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // If there are cargo lines, generate an invoice for each
  if (instruction.cargoLines && instruction.cargoLines.length > 0) {
    for (const cargo of instruction.cargoLines) {
      const invoiceData = {
        invoiceDate,
        transportOrder: instruction.transportOrder,
        fileNumber: instruction.fileNumber,
        instructionDate: instruction.instructionDate || instruction.date,
        deliveryDate: cargo.deliveryDate || instruction.date,
        vehicleReg: cargo.vehicleReg || instruction.vehicleReg,
        clientName: instruction.issuingCompany,
        collectionPoint: instruction.collectionName || '',
        deliveryPoint: instruction.deliveryName || '',
        cargoDescription: cargo.cargo || cargo.description || '1 CARGO',
        ratePerTon: instruction.ratePerTon,
        quantity: cargo.tons || 35
      };

      const result = await generateInvoice(invoiceData, outputDir);
      generatedInvoices.push(result);
    }
  } else {
    // Generate single invoice with default values
    const invoiceData = {
      invoiceDate,
      transportOrder: instruction.transportOrder,
      fileNumber: instruction.fileNumber,
      instructionDate: instruction.instructionDate || instruction.date,
      deliveryDate: instruction.date,
      vehicleReg: instruction.vehicleReg,
      clientName: instruction.issuingCompany,
      collectionPoint: instruction.collectionName || '',
      deliveryPoint: instruction.deliveryName || '',
      cargoDescription: '1 CARGO',
      ratePerTon: instruction.ratePerTon,
      quantity: 35
    };

    const result = await generateInvoice(invoiceData, outputDir);
    generatedInvoices.push(result);
  }

  return generatedInvoices;
}

export default {
  generateInvoice,
  generateInvoiceHTML,
  generatePDF,
  processTransportInstruction,
  getNextInvoiceNumber,
  getCurrentInvoiceNumber,
  setInvoiceNumber,
  regenerateInvoiceWithActualTonnage,
  COMPANY_CONFIG,
  BANK_CONFIG,
  KNOWN_CLIENTS
};

/**
 * Regenerate invoice with updated tonnage
 * @param {string} invoiceNumber - Invoice number to update
 * @param {number} actualTonnage - Actual tonnage from weighbridge
 * @param {string} invoicesDir - Invoices directory path
 * @param {string} cargoDescription - Cargo description (optional, uses original if not provided)
 * @param {string} deliveryPoint - Delivery destination (optional, uses original if not provided)
/**
 * Regenerate invoice with updated tonnage, cargo, destination, and delivery date
 * @param {string} invoiceNumber - Invoice number to update
 * @param {number} actualTonnage - Actual tonnage from weighbridge
 * @param {string} invoicesDir - Invoices directory path
 * @param {string} cargoDescription - Cargo description (optional, uses original if not provided)
 * @param {string} deliveryPoint - Delivery destination (optional, uses original if not provided)
 * @param {string} deliveryDate - Delivery date (optional, uses original if not provided)
 * @returns {object} Updated invoice info
 */
export async function regenerateInvoiceWithActualTonnage(invoiceNumber, actualTonnage, invoicesDir = './invoices', cargoDescription = null, deliveryPoint = null, deliveryDate = null) {
  const { getInvoiceMetadata } = await import('./invoice-metadata.js');
  
  // Get original invoice data
  const originalData = getInvoiceMetadata(invoiceNumber);
  
  if (!originalData) {
    throw new Error(`Invoice metadata not found for #${invoiceNumber}`);
  }
  
  // Create updated and discarded directories
  const updatedDir = path.join(invoicesDir, 'updated');
  const discardedDir = path.join(invoicesDir, 'discarded');
  
  if (!fs.existsSync(updatedDir)) {
    fs.mkdirSync(updatedDir, { recursive: true });
  }
  if (!fs.existsSync(discardedDir)) {
    fs.mkdirSync(discardedDir, { recursive: true });
  }
  
  // Original invoice filename
  const originalFilename = `Invoice_${String(invoiceNumber).padStart(3, '0')}.pdf`;
  const originalPath = path.join(invoicesDir, originalFilename);
  
  // Move original to discarded
  if (fs.existsSync(originalPath)) {
    const discardedPath = path.join(discardedDir, originalFilename);
    fs.renameSync(originalPath, discardedPath);
    console.log(`   📦 Original moved to: ./invoices/discarded/`);
  }
  
  // Create updated invoice data with actual tonnage and optional cargo description
  const updatedData = {
    ...originalData,
    quantity: actualTonnage,
    invoiceNumber: invoiceNumber // Ensure we keep the same number
  };
  
  // Update cargo description if provided
  if (cargoDescription) {
    updatedData.cargoDescription = cargoDescription;
  }
  
  // Update delivery point if provided
  if (deliveryPoint) {
    updatedData.deliveryPoint = deliveryPoint;
  }
  
  // Update delivery date if provided
  if (deliveryDate) {
    updatedData.deliveryDate = deliveryDate;
  }
  
  // Use generateInvoice directly - it handles everything
  const result = await generateInvoice(updatedData, updatedDir);
  
  // Also save a copy in main invoices directory
  const mainPath = path.join(invoicesDir, originalFilename);
  fs.copyFileSync(result.path, mainPath);
  
  console.log(`   ✅ Updated invoice generated: ./invoices/updated/`);
  console.log(`   ✅ Copy saved to: ./invoices/`);
  
  return {
    invoiceNumber,
    filename: originalFilename,
    path: result.path,
    mainPath: mainPath,
    discardedPath: path.join(discardedDir, originalFilename),
    originalQuantity: originalData.quantity,
    updatedQuantity: actualTonnage,
    cargoDescription: cargoDescription || originalData.cargoDescription,
    amounts: result.amounts
  };
}

