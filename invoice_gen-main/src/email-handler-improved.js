/**
 * SASINELWA Email Handler with Error Feedback
 * Processes incoming emails and sends detailed error feedback
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

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

/**
 * Send error email with clear explanation
 */
async function sendErrorEmail(recipientEmail, errorInfo) {
  const { error, context } = errorInfo;
  
  let emailBody = `
Hello,

We encountered an issue while processing your invoice request.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ERROR DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Problem: ${error}

`;

  // Add specific guidance based on error type
  if (error.includes('Invoice number')) {
    emailBody += `
How to Fix:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your email body must include the invoice number.

Required Format:
Invoice: 16

Example:
Invoice: 16
Tonnage: 35.5
Cargo: Chrome
`;
  } else if (error.includes('Tonnage')) {
    emailBody += `
How to Fix:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your email body must include the actual tonnage.

Required Format:
Tonnage: 35.5

Example:
Invoice: 16
Tonnage: 35.5
Cargo: Chrome
`;
  } else if (error.includes('PDF')) {
    emailBody += `
How to Fix:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your email must have a PDF attachment.

Steps:
1. Attach the transport instruction PDF to your email
2. Make sure the file ends with .pdf
3. Only attach ONE PDF file per email
`;
  } else if (error.includes('Subject')) {
    emailBody += `
How to Fix:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your email subject must contain "invoice".

Examples:
✓ Invoice Request
✓ Generate Invoice
✓ INVOICE - Chrome Delivery
✓ Please create invoice

Your subject was: ${context?.subject || 'Not provided'}
`;
  } else {
    emailBody += `
Technical Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${error}

If this error persists, please contact support.
`;
  }

  emailBody += `

Complete Example Email:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: 9ccbe9a8c1c3cf4ceac0@cloudmailin.net
Subject: Invoice Request

Invoice: 16
Tonnage: 35.5
Cargo: Chrome
Destination: BULK CONNECTIONS
Date: 2026-01-29

[Attach: transport_instruction.pdf]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Required Fields:
• Invoice: [number] - Starting invoice number
• Tonnage: [number] - Actual tonnage from weighbridge

Optional Fields:
• Cargo: [type] - e.g., Chrome, Wheat, Coal
• Destination: [name] - Delivery location
• Date: YYYY-MM-DD - Delivery date
• Scale: [number] - Scale multiplier (e.g., 1.15)

Need Help?
Reply to this email or contact support.

Best regards,
SASINELWA Invoice System
  `.trim();

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: recipientEmail,
      subject: '❌ Invoice Generation Failed - Action Required',
      text: emailBody
    });
    
    console.log(`   📧 Error email sent to: ${recipientEmail}`);
  } catch (emailError) {
    console.error(`   ❌ Failed to send error email: ${emailError.message}`);
  }
}

/**
 * Parse email body for invoice parameters
 */
function parseEmailBody(text) {
  const params = {};
  
  const invoiceMatch = text.match(/Invoice\s*[:#]?\s*(\d+)/i);
  if (invoiceMatch) {
    params.invoiceNumber = parseInt(invoiceMatch[1]);
  }
  
  const tonnageMatch = text.match(/Tonnage\s*[:#]?\s*([\d.]+)/i);
  if (tonnageMatch) {
    params.tonnage = parseFloat(tonnageMatch[1]);
  }
  
  const cargoMatch = text.match(/Cargo\s*[:#]?\s*([^\n]+)/i);
  if (cargoMatch) {
    params.cargo = cargoMatch[1].trim();
  }
  
  const destMatch = text.match(/Destination\s*[:#]?\s*([^\n]+)/i);
  if (destMatch) {
    params.destination = destMatch[1].trim();
  }
  
  const dateMatch = text.match(/Date\s*[:#]?\s*([\d\-\/]+)/i);
  if (dateMatch) {
    params.date = dateMatch[1].trim();
  }
  
  const scaleMatch = text.match(/Scale\s*[:#]?\s*([\d.]+)/i);
  if (scaleMatch) {
    params.scale = parseFloat(scaleMatch[1]);
  }
  
  return params;
}

/**
 * Process incoming email with PDF attachment
 */
export async function processEmailWithPDF(rawEmail) {
  let senderEmail = 'unknown@example.com';
  let emailSubject = '';
  
  try {
    const parsed = await simpleParser(rawEmail);
    
    senderEmail = parsed.from.value[0].address;
    emailSubject = (parsed.subject || '').toLowerCase();
    const bodyText = parsed.text || '';
    
    console.log(`📧 Email from: ${senderEmail}`);
    console.log(`   Subject: ${emailSubject}`);
    
    // Check subject contains "invoice"
    if (!emailSubject.includes('invoice')) {
      throw new Error('Subject must contain "invoice" (case-insensitive)');
    }
    
    // Parse email body
    const params = parseEmailBody(bodyText);
    
    // Validate required fields
    if (!params.invoiceNumber) {
      throw new Error('Invoice number not found in email body. Include "Invoice: 16" in your email.');
    }
    
    if (!params.tonnage) {
      throw new Error('Tonnage not found in email body. Include "Tonnage: 35.5" in your email.');
    }
    
    // Find PDF attachment
    const pdfAttachment = parsed.attachments.find(att => 
      att.contentType === 'application/pdf' || att.filename?.endsWith('.pdf')
    );
    
    if (!pdfAttachment) {
      throw new Error('No PDF attachment found. Please attach a transport instruction PDF to your email.');
    }
    
    // Save PDF temporarily
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const pdfPath = path.join(tempDir, pdfAttachment.filename || 'instruction.pdf');
    fs.writeFileSync(pdfPath, pdfAttachment.content);
    
    console.log(`   📄 PDF: ${pdfAttachment.filename}`);
    console.log(`   🔢 Invoice: ${params.invoiceNumber}`);
    console.log(`   ⚖️  Tonnage: ${params.tonnage}`);
    
    // Parse transport instruction
    const instruction = await parseTransportInstruction(pdfPath);
    
    // Set invoice number
    setInvoiceNumber(params.invoiceNumber);
    
    // Generate initial invoice
    const invoicesDir = path.join(__dirname, '../invoices');
    const invoices = await processTransportInstruction(instruction, invoicesDir);
    
    if (invoices.length === 0) {
      throw new Error('Failed to generate invoice from PDF. The PDF may be corrupted or in an unsupported format.');
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
    
    console.log(`   ✅ Invoice #${String(invoice.invoiceNumber).padStart(3, '0')}`);
    console.log(`   💰 Total: R${result.amounts.total.toFixed(2)}`);
    
    // Send success email with invoice
    await sendInvoiceEmail(senderEmail, result, params);
    
    return {
      success: true,
      invoiceNumber: invoice.invoiceNumber,
      total: result.amounts.total,
      sender: senderEmail
    };
    
  } catch (error) {
    console.error('❌ Email processing error:', error.message);
    
    // Send detailed error email to user
    await sendErrorEmail(senderEmail, {
      error: error.message,
      context: {
        subject: emailSubject
      }
    });
    
    // Re-throw for server logging
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

Your SASINELWA invoice has been generated successfully! ✅

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
    subject: `✅ SASINELWA Invoice #${invoiceNum} - R${invoiceResult.amounts.total.toFixed(2)}`,
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
