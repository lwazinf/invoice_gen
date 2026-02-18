/**
 * SASINELWA Invoice System - Web API Server
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { parseTransportInstruction } from './parser.js';
import { processTransportInstruction, setInvoiceNumber } from './generator.js';
import { 
  addPendingInvoice, 
  getPendingInvoices, 
  removePendingInvoice 
} from './matcher.js';
import { regenerateInvoiceWithActualTonnage } from './generator.js';
import { initializeDataFiles } from './init-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

initializeDataFiles();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../instructions');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

let processingState = {
  isProcessing: false,
  status: 'idle',
  progress: 0,
  total: 0,
  current: null,
  errors: []
};

app.get('/', (req, res) => {
  res.json({
    message: 'SASINELWA Invoice System API',
    version: '5.0',
    status: 'running',
    endpoints: {
      'POST /upload': 'Upload instruction PDFs',
      'POST /process': 'Generate invoices (body: {startNumber, scale?})',
      'GET /invoices': 'Download all invoices as zip',
      'GET /pending': 'Get pending invoices list',
      'POST /manual': 'Update invoice (body: {invoiceNumber, tonnage, cargo?, destination?, date?})',
      'GET /status': 'Check processing status'
    }
  });
});

app.post('/upload', upload.array('pdfs', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No PDF files uploaded' });
  }
  
  res.json({
    success: true,
    message: `Uploaded ${req.files.length} file(s)`,
    files: req.files.map(f => f.originalname)
  });
});

app.get('/status', (req, res) => {
  res.json(processingState);
});

app.get('/pending', (req, res) => {
  const pending = getPendingInvoices();
  res.json({
    count: pending.length,
    invoices: pending
  });
});

app.post('/process', async (req, res) => {
  if (processingState.isProcessing) {
    return res.status(409).json({ 
      error: 'Processing already in progress',
      status: processingState
    });
  }

  const { startNumber, scale } = req.body;
  
  if (!startNumber) {
    return res.status(400).json({ error: 'startNumber is required' });
  }

  processingState = {
    isProcessing: true,
    status: 'processing',
    progress: 0,
    total: 0,
    current: null,
    errors: [],
    invoicesGenerated: []
  };

  res.json({
    success: true,
    message: 'Processing started',
    note: 'Check /status endpoint for progress'
  });

  try {
    const INSTRUCTIONS_DIR = path.join(__dirname, '../instructions');
    const INVOICES_DIR = path.join(__dirname, '../invoices');
    const PROCESSED_DIR = path.join(INSTRUCTIONS_DIR, 'processed');

    [INSTRUCTIONS_DIR, PROCESSED_DIR, INVOICES_DIR].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    const pdfFiles = fs.readdirSync(INSTRUCTIONS_DIR)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => path.join(INSTRUCTIONS_DIR, f));

    if (pdfFiles.length === 0) {
      processingState.status = 'error';
      processingState.errors.push('No PDF files found');
      processingState.isProcessing = false;
      return;
    }

    processingState.total = pdfFiles.length;
    setInvoiceNumber(parseInt(startNumber));
    const scaleMultiplier = scale ? parseFloat(scale) : null;

    const pdfData = [];
    for (const pdfPath of pdfFiles) {
      try {
        const instruction = await parseTransportInstruction(pdfPath);
        pdfData.push({
          path: pdfPath,
          filename: path.basename(pdfPath),
          instructionDate: instruction.date || instruction.instructionDate || '2000-01-01',
          instruction: instruction
        });
      } catch (error) {
        processingState.errors.push({ file: path.basename(pdfPath), error: error.message });
      }
    }

    pdfData.sort((a, b) => new Date(a.instructionDate) - new Date(b.instructionDate));

    for (const pdf of pdfData) {
      processingState.current = pdf.filename;
      processingState.progress++;

      try {
        const invoices = await processTransportInstruction(pdf.instruction, INVOICES_DIR);

        for (const inv of invoices) {
          const tonnage = scaleMultiplier ? (inv.quantity || 35) * scaleMultiplier : (inv.quantity || 35);
          
          addPendingInvoice({
            invoiceNumber: inv.invoiceNumber,
            transportOrder: pdf.instruction.transportOrder,
            vehicleReg: pdf.instruction.vehicleReg,
            deliveryPoint: inv.deliveryPoint || pdf.instruction.deliveryName || 'N/A',
            deliveryDate: pdf.instruction.deliveryDate || pdf.instruction.date,
            instructionDate: pdf.instruction.date || pdf.instruction.instructionDate,
            quantity: tonnage,
            originalQuantity: inv.quantity || 35,
            ratePerTon: pdf.instruction.ratePerTon,
            clientName: pdf.instruction.issuingCompany,
            cargo: inv.cargoDescription || 'Cargo',
            description: inv.cargoDescription || 'Cargo'
          });

          processingState.invoicesGenerated.push({
            number: inv.invoiceNumber,
            amount: inv.amounts.total
          });
        }

        fs.renameSync(pdf.path, path.join(PROCESSED_DIR, pdf.filename));
      } catch (error) {
        processingState.errors.push({ file: pdf.filename, error: error.message });
      }
    }

    processingState.status = 'completed';
    processingState.isProcessing = false;

  } catch (error) {
    processingState.status = 'error';
    processingState.errors.push({ general: error.message });
    processingState.isProcessing = false;
  }
});

app.post('/manual', async (req, res) => {
  const { invoiceNumber, tonnage, cargo, destination, date } = req.body;

  if (!invoiceNumber || !tonnage) {
    return res.status(400).json({ error: 'invoiceNumber and tonnage are required' });
  }

  try {
    const pending = getPendingInvoices();
    const invoice = pending.find(inv => String(inv.invoiceNumber) === String(invoiceNumber));

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const actualTons = parseFloat(tonnage);
    if (isNaN(actualTons) || actualTons <= 0) {
      return res.status(400).json({ error: 'Invalid tonnage' });
    }

    const finalCargo = cargo || invoice.cargo || 'Cargo';
    const finalDestination = destination || invoice.deliveryPoint || 'N/A';
    const finalDate = date || invoice.deliveryDate || '';

    const invoicesDir = path.join(__dirname, '../invoices');
    const result = await regenerateInvoiceWithActualTonnage(
      invoiceNumber, actualTons, invoicesDir, finalCargo, finalDestination, finalDate
    );

    removePendingInvoice(invoiceNumber);

    const difference = actualTons - invoice.quantity;
    const percentDiff = ((difference / invoice.quantity) * 100).toFixed(2);

    res.json({
      success: true,
      invoice: {
        number: invoiceNumber,
        cargo: finalCargo,
        destination: finalDestination,
        date: finalDate,
        actualTonnage: actualTons,
        variance: { tons: difference, percent: percentDiff },
        newTotal: result.amounts.total
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/invoices', (req, res) => {
  const INVOICES_DIR = path.join(__dirname, '../invoices');
  
  if (!fs.existsSync(INVOICES_DIR)) {
    return res.status(404).json({ error: 'No invoices found' });
  }

  const files = fs.readdirSync(INVOICES_DIR).filter(f => f.endsWith('.pdf'));

  if (files.length === 0) {
    return res.status(404).json({ error: 'No invoices generated yet' });
  }

  const archive = archiver('zip', { zlib: { level: 9 } });
  res.attachment('invoices.zip');
  archive.pipe(res);

  files.forEach(file => {
    archive.file(path.join(INVOICES_DIR, file), { name: file });
  });

  archive.finalize();
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SASINELWA API running on port ${PORT}`);
});
