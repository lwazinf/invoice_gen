# 📧 Email Forwarding → Invoice Generation Workflow

## Overview

Forward transport instruction emails (with PDF attachments) to a dedicated inbox, and automatically generate professional invoices for each instruction.

## 🎯 Workflow

```
Transport Instructions Email (1-N PDFs)
           ↓
Forward to: invoices@yourdomain.com
           ↓
n8n monitors inbox (IMAP)
           ↓
For each PDF attachment:
  - Download PDF
  - Parse transport details
  - Generate invoice
  - Send to client via SendGrid
```

## 🚀 Complete Setup Guide

### Step 1: Create Dedicated Gmail Account

1. **Create new Gmail**: `sasinelwa.invoices@gmail.com`
2. **Enable 2FA**: Required for App Passwords
3. **Generate App Password**:
   - Google Account → Security → 2-Step Verification → App Passwords
   - Select "Mail" and "Other (Custom name)"
   - Copy the 16-character password
4. **Save credentials**:
   ```env
   GMAIL_USER=sasinelwa.invoices@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   ```

### Step 2: Deploy Invoice Generator

#### Option A: Fly.io (Recommended - Free)

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
flyctl auth login

# Deploy
flyctl launch
flyctl deploy

# Get URL
# Example: https://sasinelwa-invoice.fly.dev
```

#### Option B: Local (Development)

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Deploy
fly launch

# Get URL
# Example: https://sasinelwa-invoice.fly.dev
```

#### Option C: Local (Development)

```bash
# Just run locally
npm start
# URL: http://localhost:3000

# For n8n access, use ngrok
ngrok http 3000
# URL: https://xxxx.ngrok.io
```

### Step 3: Deploy n8n

#### Option A: Railway

```bash
# One-click deploy
https://railway.app/template/n8n

# Or manual:
railway init
railway add postgresql
railway up
```

#### Option B: Render (Free)

```bash
# Go to render.com
# New → Web Service
# Connect GitHub (fork n8n repo)
# Deploy
```

### Step 4: Create n8n Workflow

#### Import This Workflow

```json
{
  "name": "SASINELWA Invoice Automation",
  "nodes": [
    {
      "name": "Email Trigger",
      "type": "n8n-nodes-base.emailReadImap",
      "parameters": {
        "mailbox": "INBOX",
        "postProcessAction": "mark",
        "options": {
          "attachments": true
        }
      },
      "credentials": {
        "imap": {
          "user": "sasinelwa.invoices@gmail.com",
          "password": "your-app-password",
          "host": "imap.gmail.com",
          "port": 993,
          "secure": true
        }
      }
    },
    {
      "name": "Check for PDFs",
      "type": "n8n-nodes-base.filter",
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.attachments }}",
              "operation": "isNotEmpty"
            }
          ]
        }
      }
    },
    {
      "name": "Split Attachments",
      "type": "n8n-nodes-base.splitInBatches",
      "parameters": {
        "batchSize": 1,
        "options": {}
      }
    },
    {
      "name": "Filter PDF Only",
      "type": "n8n-nodes-base.filter",
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.attachment.contentType }}",
              "operation": "contains",
              "value2": "pdf"
            }
          ]
        }
      }
    },
    {
      "name": "Parse PDF",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://your-invoice-api.railway.app/parse-pdf",
        "method": "POST",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "pdf",
              "value": "={{ $json.attachment.data }}"
            }
          ]
        },
        "options": {
          "response": {
            "response": {
              "fullResponse": false,
              "responseFormat": "json"
            }
          }
        }
      }
    },
    {
      "name": "Generate Invoice",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://your-invoice-api.railway.app/generate-invoice",
        "method": "POST",
        "bodyParametersUi": {
          "parameter": [
            {
              "name": "transportOrder",
              "value": "={{ $json.transportOrder }}"
            },
            {
              "name": "fileNumber",
              "value": "={{ $json.fileNumber }}"
            },
            {
              "name": "deliveryDate",
              "value": "={{ $json.deliveryDate }}"
            },
            {
              "name": "vehicleReg",
              "value": "={{ $json.vehicleReg }}"
            },
            {
              "name": "clientName",
              "value": "={{ $json.clientName }}"
            },
            {
              "name": "collectionPoint",
              "value": "={{ $json.collectionPoint }}"
            },
            {
              "name": "deliveryPoint",
              "value": "={{ $json.deliveryPoint }}"
            },
            {
              "name": "cargoDescription",
              "value": "={{ $json.cargoDescription }}"
            },
            {
              "name": "ratePerTon",
              "value": "={{ $json.ratePerTon }}"
            },
            {
              "name": "quantity",
              "value": "={{ $json.quantity }}"
            }
          ]
        }
      }
    },
    {
      "name": "Send Invoice Email",
      "type": "n8n-nodes-base.sendGrid",
      "parameters": {
        "apiKey": "={{ $env.SENDGRID_API_KEY }}",
        "to": "={{ $json.clientEmail }}",
        "from": "invoices@sasinelwa.co.za",
        "subject": "Transport Invoice #{{ $json.invoiceNumber }}",
        "text": "Dear {{ $json.clientName }},\n\nPlease find attached your transport invoice.\n\nThank you for your business.\n\nSASINELWA (PTY) Ltd.",
        "attachments": [
          {
            "content": "={{ $json.pdfBase64 }}",
            "filename": "{{ $json.filename }}",
            "type": "application/pdf"
          }
        ]
      }
    }
  ],
  "connections": {
    "Email Trigger": {
      "main": [[{"node": "Check for PDFs", "type": "main", "index": 0}]]
    },
    "Check for PDFs": {
      "main": [[{"node": "Split Attachments", "type": "main", "index": 0}]]
    },
    "Split Attachments": {
      "main": [[{"node": "Filter PDF Only", "type": "main", "index": 0}]]
    },
    "Filter PDF Only": {
      "main": [[{"node": "Parse PDF", "type": "main", "index": 0}]]
    },
    "Parse PDF": {
      "main": [[{"node": "Generate Invoice", "type": "main", "index": 0}]]
    },
    "Generate Invoice": {
      "main": [[{"node": "Send Invoice Email", "type": "main", "index": 0}]]
    }
  }
}
```

### Step 5: Add PDF Parser Endpoint

The invoice generator needs a PDF parser. Add this to your `src/index.js`:

```javascript
// Add to src/index.js
import pdfParse from 'pdf-parse';

app.post('/parse-pdf', async (req, res) => {
  try {
    const { pdf } = req.body; // base64 encoded PDF
    const buffer = Buffer.from(pdf, 'base64');
    
    // Parse PDF
    const data = await pdfParse(buffer);
    const text = data.text;
    
    // Extract transport details using regex
    const transportOrder = text.match(/Transport Order Number[:\s]+(\w+)/i)?.[1];
    const fileNumber = text.match(/File Number[:\s]+(\w+)/i)?.[1];
    const deliveryDate = text.match(/Delivery Date[:\s]+([^\n]+)/i)?.[1];
    const vehicleReg = text.match(/([A-Z]{2,3}\s?\d{3,4}\s?[A-Z]{2})/)?.[1];
    
    // Extract client name (usually after "ISSUED TO" or similar)
    const clientName = text.match(/(?:Issued to|Client|Company)[:\s]+([^\n]+)/i)?.[1];
    
    // Extract locations
    const collectionPoint = text.match(/Collection[:\s]+([^\n]+)/i)?.[1];
    const deliveryPoint = text.match(/Delivery[:\s]+([^\n]+)/i)?.[1];
    
    // Extract cargo details
    const cargoDescription = text.match(/Cargo[:\s]+([^\n]+)/i)?.[1];
    
    // Extract rate and quantity
    const rateMatch = text.match(/R?(\d+)\s*(?:PER TON|per ton)/i);
    const ratePerTon = rateMatch ? parseFloat(rateMatch[1]) : 0;
    
    const quantityMatch = text.match(/(\d+\.?\d*)\s*(?:tons?|t\b)/i);
    const quantity = quantityMatch ? parseFloat(quantityMatch[1]) : 0;
    
    res.json({
      transportOrder,
      fileNumber,
      deliveryDate,
      vehicleReg,
      clientName,
      collectionPoint,
      deliveryPoint,
      cargoDescription,
      ratePerTon,
      quantity,
      // Also return client email if found
      clientEmail: text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/)?.[1]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Step 6: Usage Instructions

#### For You (Forwarding Emails)

1. **Receive transport instruction email** with PDF attachment(s)
2. **Forward the entire email** to: `sasinelwa.invoices@gmail.com`
3. **That's it!** n8n will:
   - Detect new email
   - Extract all PDF attachments
   - Parse each PDF
   - Generate invoices
   - Send to clients

#### Example Forward

```
From: you@sasinelwa.co.za
To: sasinelwa.invoices@gmail.com
Subject: Fwd: Transport Instructions

---------- Forwarded message ---------
From: client@ensign.co.za
Date: Mon, Feb 15, 2026
Subject: Transport Instructions

[Original email with 3 PDF attachments]
```

**Result**: 3 invoices generated and sent!

### Step 7: Testing

#### Test Email Forwarding

1. Send test email with sample PDF to your forwarding inbox
2. Check n8n execution log
3. Verify invoice generated in `/invoices` folder
4. Check client received email

#### Manual Test (before n8n)

```bash
# Test PDF parsing
curl -X POST http://localhost:3000/parse-pdf \
  -H "Content-Type: application/json" \
  -d '{"pdf":"base64_encoded_pdf_here"}'

# Test invoice generation
curl -X POST http://localhost:3000/generate-invoice \
  -H "Content-Type: application/json" \
  -d '{...parsed_data...}'
```

## 🔧 Configuration Summary

### .env File

```env
# API Server
PORT=3000

# Company Details (pre-filled)
COMPANY_NAME=SASINELWA (PTY) Ltd.
COMPANY_REG=2023/191021/07
COMPANY_VAT=4740319340
COMPANY_PHONE=082 569 5593
COMPANY_EMAIL=ndlovud22@gmail.com

# Bank Details
BANK_NAME=Capitec
BANK_ACCOUNT_NUMBER=1051802806

# Email
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx

# Invoice Settings
INVOICE_START_NUMBER=1
VAT_RATE=0.15
```

### n8n Environment Variables

```env
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your_secure_password
WEBHOOK_URL=https://your-n8n.railway.app
```

## 📊 Cost Breakdown (100% Free)

| Service | Free Tier | Your Usage |
|---------|-----------|------------|
| Gmail | Unlimited | Email forwarding |
| n8n | Self-hosted free | Automation |
| Fly.io | 3 VMs + 3GB storage | API + n8n hosting |
| SendGrid | 100 emails/day | 50 invoices/day |
| **Total** | **$0/month** | ✅ |

## 🎯 Daily Workflow

### Your Morning Routine

1. Check email for transport instructions
2. Forward all to `sasinelwa.invoices@gmail.com`
3. Invoices auto-generated and sent
4. Check n8n dashboard for confirmations

### No More:
- ❌ Manual invoice creation
- ❌ Copy-pasting details
- ❌ PDF generation
- ❌ Email sending
- ❌ Invoice numbering

### Just:
- ✅ Forward emails
- ✅ Done!

## 🆘 Troubleshooting

### Email not triggering?

Check:
1. n8n workflow is activated
2. Gmail App Password is correct
3. Email has PDF attachments

### PDF parsing fails?

Check:
1. PDF is readable (not scanned image)
2. Regex patterns match your PDF format
3. Update patterns in `parse-pdf` endpoint

### Invoice not sent?

Check:
1. SendGrid API key valid
2. Client email extracted correctly
3. n8n SendGrid node configured

## 📈 Scaling

### Current: 50 invoices/day

### Need more?

**100-500/day:**
- Upgrade SendGrid: $19.95/month (40k emails)

**500-1000/day:**
- Railway Pro: $20/month
- SendGrid Essential: $19.95/month

## 🎉 You're Done!

Forward emails → Invoices sent automatically!

**Setup time: 30 minutes**
**Daily time saved: 2 hours**
**Monthly cost: R0.00** 🎊
