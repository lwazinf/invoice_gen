# 📧 Error Feedback System

## What Changed

### ✅ Automatic Error Emails

When invoice generation fails, the system now sends a **detailed error email** to the sender explaining:
- What went wrong
- How to fix it
- Example of correct format
- Complete instructions

### ✅ Vehicle Registration Preserved

The delivery date field now **keeps the vehicle registration** exactly as it appears in the PDF.

**Example:**
- Before: `Delivery Date: 2026-01-29` (registration removed)
- Now: `Delivery Date: 2026-01-29 DDR829NC` (registration kept)

---

## Error Email Examples

### Error 1: Missing Invoice Number

**What user sees:**
```
Subject: ❌ Invoice Generation Failed - Action Required

Problem: Invoice number not found in email body.

How to Fix:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your email body must include the invoice number.

Required Format:
Invoice: 16

Example:
Invoice: 16
Tonnage: 35.5
Cargo: Chrome
```

---

### Error 2: Missing Tonnage

**What user sees:**
```
Problem: Tonnage not found in email body.

How to Fix:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your email body must include the actual tonnage.

Required Format:
Tonnage: 35.5

Example:
Invoice: 16
Tonnage: 35.5
Cargo: Chrome
```

---

### Error 3: No PDF Attachment

**What user sees:**
```
Problem: No PDF attachment found.

How to Fix:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your email must have a PDF attachment.

Steps:
1. Attach the transport instruction PDF to your email
2. Make sure the file ends with .pdf
3. Only attach ONE PDF file per email
```

---

### Error 4: Wrong Subject

**What user sees:**
```
Problem: Subject must contain "invoice" (case-insensitive)

How to Fix:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your email subject must contain "invoice".

Examples:
✓ Invoice Request
✓ Generate Invoice
✓ INVOICE - Chrome Delivery
✓ Please create invoice

Your subject was: Letter Request
```

---

### Error 5: PDF Parse Error

**What user sees:**
```
Problem: Failed to generate invoice from PDF. The PDF may be corrupted or in an unsupported format.

Technical Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Error message here]

If this error persists, please contact support.
```

---

## Success Email (For Comparison)

When invoice generation succeeds:

```
Subject: ✅ SASINELWA Invoice #016 - R20,475.00

Hello,

Your SASINELWA invoice has been generated successfully! ✅

Invoice Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Invoice Number: #016
• Cargo: Chrome
• Destination: BULK CONNECTIONS
• Delivery Date: 2026-01-29 DDR829NC
• Actual Tonnage: 35.5 tons
• Total Amount: R20,475.00

Variance: 0.5 tons

[Invoice PDF attached]
```

---

## Technical Details

### Error Detection Points

The system checks for errors at these stages:

1. **Subject Validation**
   - Must contain "invoice"
   - Case-insensitive

2. **Parameter Parsing**
   - Invoice number (required)
   - Tonnage (required)
   - Cargo (optional)
   - Destination (optional)
   - Date (optional)

3. **PDF Validation**
   - Must have attachment
   - Must be .pdf file
   - Must be parseable

4. **Invoice Generation**
   - PDF parsing must succeed
   - Invoice creation must succeed
   - File write must succeed

### Error Email Flow

```
User sends email
  ↓
System receives via CloudMailin
  ↓
Error occurs during processing
  ↓
Error caught by try-catch
  ↓
Detailed error email sent to user
  ↓
Error logged to console
  ↓
HTTP 500 response to CloudMailin
```

### Code Changes

**File:** `src/email-handler.js`

**Added:**
- `sendErrorEmail()` function
- Error-specific guidance messages
- Complete example email in every error
- User-friendly error explanations

**File:** `src/parser.js`

**Removed:**
- `cleanDate()` function
- Vehicle registration stripping logic

**Result:**
- Delivery dates now show as: `2026-01-29 DDR829NC`
- Original PDF data preserved

---

## Testing Error Emails

### Test Missing Invoice Number

```
To: 9ccbe9a8c1c3cf4ceac0@cloudmailin.net
Subject: Invoice Request

Tonnage: 35.5
Cargo: Chrome

[Attach PDF]
```

**Expected:** Error email explaining invoice number is missing

---

### Test Missing Tonnage

```
To: 9ccbe9a8c1c3cf4ceac0@cloudmailin.net
Subject: Invoice Request

Invoice: 16
Cargo: Chrome

[Attach PDF]
```

**Expected:** Error email explaining tonnage is missing

---

### Test No PDF

```
To: 9ccbe9a8c1c3cf4ceac0@cloudmailin.net
Subject: Invoice Request

Invoice: 16
Tonnage: 35.5
```

**Expected:** Error email explaining PDF attachment is missing

---

### Test Wrong Subject

```
To: 9ccbe9a8c1c3cf4ceac0@cloudmailin.net
Subject: Letter Request

Invoice: 16
Tonnage: 35.5

[Attach PDF]
```

**Expected:** Error email explaining subject must contain "invoice"

---

## Benefits

### For Users
✅ Clear error messages instead of silence
✅ Step-by-step fix instructions
✅ Complete examples for reference
✅ No need to guess what went wrong

### For Support
✅ Fewer support emails
✅ Self-service error resolution
✅ Clear error documentation
✅ Users can retry immediately

### For System
✅ Better error logging
✅ User-friendly experience
✅ Reduced confusion
✅ Professional error handling

---

## Error Email Template Structure

Every error email includes:

1. **Problem Statement**
   - Clear description of what went wrong

2. **How to Fix**
   - Specific steps to resolve the issue

3. **Complete Example**
   - Full working email example
   - All required and optional fields

4. **Field Reference**
   - List of all available parameters
   - Required vs optional indicators

5. **Support Information**
   - How to get help if needed

---

**Professional error handling = Better user experience!** 📧✨
