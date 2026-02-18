/**
 * SASINELWA Invoice System - Main Server
 * HTTP API for invoice generation
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseTransportInstruction } from './parser.js';
import { generateInvoice, processTransportInstruction } from './generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/invoices', express.static(path.join(__dirname, '..', 'invoices')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API: Generate invoice from uploaded PDF
app.post('/api/process-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    console.log('📄 Processing uploaded PDF:', req.file.originalname);

    // Parse the transport instruction
    const instruction = await parseTransportInstruction(req.file.path);

    // Generate invoices
    const invoices = await processTransportInstruction(instruction, './invoices');

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      instruction: {
        company: instruction.issuingCompany,
        transportOrder: instruction.transportOrder,
        fileNumber: instruction.fileNumber,
        ratePerTon: instruction.ratePerTon
      },
      invoices: invoices.map(inv => ({
        invoiceNumber: inv.invoiceNumber,
        filename: inv.filename,
        downloadUrl: `/invoices/${inv.filename}`,
        amounts: inv.amounts
      }))
    });

  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Generate invoice manually
app.post('/api/generate', async (req, res) => {
  try {
    const {
      clientName,
      ratePerTon,
      quantity,
      transportOrder,
      fileNumber,
      deliveryDate,
      vehicleReg,
      cargoDescription,
      collectionPoint,
      deliveryPoint
    } = req.body;

    if (!clientName || !ratePerTon || !quantity) {
      return res.status(400).json({
        error: 'Missing required fields: clientName, ratePerTon, quantity'
      });
    }

    const invoiceData = {
      clientName,
      ratePerTon: parseFloat(ratePerTon),
      quantity: parseFloat(quantity),
      transportOrder: transportOrder || '',
      fileNumber: fileNumber || '',
      deliveryDate: deliveryDate || '',
      vehicleReg: vehicleReg || '',
      cargoDescription: cargoDescription || '1 CARGO',
      collectionPoint: collectionPoint || '',
      deliveryPoint: deliveryPoint || ''
    };

    const result = await generateInvoice(invoiceData, './invoices');

    res.json({
      success: true,
      invoice: {
        invoiceNumber: result.invoiceNumber,
        filename: result.filename,
        downloadUrl: `/invoices/${result.filename}`,
        amounts: result.amounts
      }
    });

  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: List generated invoices
app.get('/api/invoices', (req, res) => {
  try {
    const invoicesDir = path.join(__dirname, '..', 'invoices');
    
    if (!fs.existsSync(invoicesDir)) {
      return res.json({ invoices: [] });
    }

    const files = fs.readdirSync(invoicesDir)
      .filter(f => f.endsWith('.pdf'))
      .map(filename => {
        const stats = fs.statSync(path.join(invoicesDir, filename));
        return {
          filename,
          downloadUrl: `/invoices/${filename}`,
          size: stats.size,
          created: stats.birthtime
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({ invoices: files });

  } catch (error) {
    console.error('Error listing invoices:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           SASINELWA INVOICE SYSTEM                            ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   🚀 Server running on http://localhost:${PORT}                 ║
║                                                               ║
║   Endpoints:                                                  ║
║   POST /api/process-pdf  - Upload & process transport PDF     ║
║   POST /api/generate     - Generate invoice manually          ║
║   GET  /api/invoices     - List generated invoices            ║
║   GET  /invoices/:file   - Download invoice PDF               ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);
});

export default app;
