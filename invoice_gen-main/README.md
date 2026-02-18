# SASINELWA Invoice Generator v4.0 🚀

**Professional Transport Invoice System** - Production-ready with perfect design.

## 🚀 Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
nano .env

# 3. Run
npm start
```

## ⚙️ Configuration

Copy `.env.example` to `.env` and fill in your details. All settings are configurable via environment variables.

## 📊 Usage

### API
```bash
curl -X POST http://localhost:3000/generate -H "Content-Type: application/json" -d @invoice-data.json
```

### Programmatic
```javascript
import { generateInvoice } from './src/generator.js';
const result = await generateInvoice(invoiceData);
```

## 💰 100% Free Stack (50 invoices/day)

- n8n: Self-hosted (R0)
- Gmail: Free tier (R0)
- SendGrid: 100/day free (R0)
- Total: **R0.00/month**

---

**Version 4.0.0** | Production Ready ✅
