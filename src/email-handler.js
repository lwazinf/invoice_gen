/**
 * SASINELWA Email Handler
 * Processes incoming emails with PDF attachments
 */

import { parseTransportInstruction } from './parser.js';
import { processTransportInstruction, setInvoiceNumber, regenerateInvoiceWithActualTonnage } from './generator.js';
import { addPendingInvoice, removePendingInvoice } from './matcher.js';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Email configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Parse email body to extract invoice parameters
 */
function parseEmailBody(text) {
  const params = {};
  
  // Extract invoice number
  const invoiceMatch = text.match(/Invoice\s*[:#]?\s*(\d+)/i);
  if (invoiceMatch) {
    params.invoiceNumber = parseInt(invoiceMatch[1]);
  }
  
  // Extract tonnage
  const tonnageMatch = text.match(/Tonnage\s*[:#]?\s*([\d.]+)/i);
  if (tonnageMatch) {
    params.tonnage = parseFloat(tonnageMatch[1]);
  }
  
  // Extract cargo
  const cargoMatch = text.match(/Cargo\s*[:#]?\s*([^\n]+)/i);
  if (cargoMatch) {
    params.cargo = cargoMatch[1].trim();
  }
  
  // Extract destination
  const destMatch = text.match(/Destination\s*[:#]?\s*([^\n]+)/i);
  if (destMatch) {
    params.destination = destMatch[1].trim();
  }
  
  // Extract date
  const dateMatch = text.match(/Date\s*[:#]?\s*([\d\-\/]+)/i);
  if (dateMatch) {
    params.date = dateMatch[1].trim();
  }
  
  // Extract scale (optional)
  const scaleMatch = text.match(/Scale\s*[:#]?\s*([\d.]+)/i);
  if (scaleMatch) {
    params.scale = parseFloat(scaleMatch[1]);
  }
  
  return params;
}

/**
 * Process incoming email with PDF attachment
 */
export async function processEmailWithPDF(emailData) {
  try {
    const parsed = await simpleParser(emailData);
    
    const senderEmail = parsed.from.value[0].address;
    const subject = parsed.subject;
    const bodyText = parsed.text || '';
    
    console.log(`📧 Processing email from: ${senderEmail}`);
    console.log(`   Subject: ${subject}`);
    
    // Parse email body for parameters
    const params = parseEmailBody(bodyText);
    
    if (!params.invoiceNumber) {
      throw new Error('Invoice number not found in email. Include "Invoice: 16" in email body.');
    }
    
    if (!params.tonnage) {
      throw new Error('Tonnage not found in email. Include "Tonnage: 35.5" in email body.');
    }
    
    // Find PDF attachment
    const pdfAttachment = parsed.attachments.find(att => 
      att.contentType === 'application/pdf'
    );
    
    if (!pdfAttachment) {
      throw new Error('No PDF attachment found in email.');
    }
    
    // Save PDF temporarily
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const pdfPath = path.join(tempDir, pdfAttachment.filename);
    fs.writeFileSync(pdfPath, pdfAttachment.content);
    
    console.log(`   📄 PDF saved: ${pdfAttachment.filename}`);
    console.log(`   🔢 Invoice number: ${params.invoiceNumber}`);
    console.log(`   ⚖️  Tonnage: ${params.tonnage}`);
    
    // Parse transport instruction
    const instruction = await parseTransportInstruction(pdfPath);
    
    // Set invoice number
    setInvoiceNumber(params.invoiceNumber);
    
    // Generate initial invoice
    const invoicesDir = path.join(__dirname, '../invoices');
    const invoices = await processTransportInstruction(instruction, invoicesDir);
    
    if (invoices.length === 0) {
      throw new Error('Failed to generate invoice from PDF.');
    }
    
    const invoice = invoices[0];
    
    // Add to pending
    const scaleMultiplier = params.scale || null;
    const tonnage = scaleMultiplier ? (invoice.quantity || 35) * scaleMultiplier : (invoice.quantity || 35);
    
    addPendingInvoice({
      invoiceNumber: invoice.invoiceNumber,
      transportOrder: instruction.transportOrder,
      vehicleReg: instruction.vehicleReg,
      deliveryPoint: params.destination || invoice.deliveryPoint || instruction.deliveryName || 'N/A',
      deliveryDate: params.date || instruction.deliveryDate || instruction.date,
      instructionDate: instruction.date || instruction.instructionDate,
      quantity: tonnage,
      originalQuantity: invoice.quantity || 35,
      ratePerTon: instruction.ratePerTon,
      clientName: instruction.issuingCompany,
      cargo: params.cargo || invoice.cargoDescription || 'Cargo',
      description: params.cargo || invoice.cargoDescription || 'Cargo'
    });
    
    // Update with actual tonnage and details
    const result = await regenerateInvoiceWithActualTonnage(
      invoice.invoiceNumber,
      params.tonnage,
      invoicesDir,
      params.cargo,
      params.destination,
      params.date
    );
    
    // Remove from pending
    removePendingInvoice(invoice.invoiceNumber);
    
    // Clean up temp PDF
    fs.unlinkSync(pdfPath);
    
    console.log(`   ✅ Invoice generated: #${String(invoice.invoiceNumber).padStart(3, '0')}`);
    console.log(`   💰 Total: R${result.amounts.total.toFixed(2)}`);
    
    // Send reply email with invoice
    await sendInvoiceEmail(senderEmail, result, params);
    
    return {
      success: true,
      invoiceNumber: invoice.invoiceNumber,
      total: result.amounts.total,
      sender: senderEmail
    };
    
  } catch (error) {
    console.error('❌ Email processing error:', error.message);
    throw error;
  }
}

/**
 * Send invoice PDF back to sender
 */
async function sendInvoiceEmail(recipientEmail, invoiceResult, params) {
  const invoiceNum = String(invoiceResult.invoiceNumber).padStart(3, '0');
  const invoicePath = invoiceResult.mainPath;
  
  const emailBody = `
Hello,

Your SASINELWA invoice has been generated successfully!

Invoice Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Invoice Number: #${invoiceNum}
• Cargo: ${params.cargo || 'N/A'}
• Destination: ${params.destination || 'N/A'}
• Delivery Date: ${params.date || 'N/A'}
• Actual Tonnage: ${params.tonnage} tons
• Total Amount: R${invoiceResult.amounts.total.toFixed(2)}

Variance: ${(params.tonnage - invoiceResult.originalQuantity).toFixed(2)} tons

Please find the invoice PDF attached.

Best regards,
SASINELWA Invoice System
  `.trim();
  
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: recipientEmail,
    subject: `SASINELWA Invoice #${invoiceNum}`,
    text: emailBody,
    attachments: [
      {
        filename: `Invoice_${invoiceNum}.pdf`,
        path: invoicePath
      }
    ]
  };
  
  await transporter.sendMail(mailOptions);
  console.log(`   📧 Invoice sent to: ${recipientEmail}`);
}

export default { processEmailWithPDF };
