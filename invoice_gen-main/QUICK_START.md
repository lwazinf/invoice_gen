# 🚀 SASINELWA v5.0 - FINAL VERSION

## ✅ All Issues Fixed

1. ✅ **Date positioned correctly** - Top left, same line as Transport Order Number
2. ✅ **Invoice number required** - Must specify starting number
3. ✅ **Cargo selection menu** - Choose from 13 options
4. ✅ **Syntax error fixed** - Manual menu works perfectly
5. ✅ **Empty instructions folder** - Ready for your PDFs

---

## 🎯 Quick Start

```bash
# 1. Extract and install
unzip sasinelwa_v5_FINAL.zip
cd sasinelwa_v5_clean
npm install

# 2. Add your PDFs to ./instructions/

# 3. Run with REQUIRED invoice number
npm run process 16
```

---

## 📝 Command Examples

### **Basic Usage**
```bash
npm run process 1              # Start at invoice #001
npm run process 16             # Start at invoice #016  
npm run process 100            # Start at invoice #100
```

### **With Scale Adjustment**
```bash
npm run process 16 1.15        # Start at #016, +15% scale
npm run process 16 0.9         # Start at #016, -10% scale
npm run process 50 1.05        # Start at #050, +5% scale
```

---

## 🎨 Cargo Selection Menu

When updating manually, you get 13 options:

```
Is the cargo description correct?
  [Enter] = Accept current
  [1-13] = Choose from list:
    1. Wheat
    2. Millscale
    3. Fertilizer
    4. Maize
    5. Chrome
    6. Sunflower
    7. Coal
    8. Iron
    9. Steel
    10. Ore
    11. Slag
    12. Soya
    13. Other

Your choice: 
```

**Three ways to update:**
1. Press **Enter** = Keep current
2. Type **1-12** = Select from list
3. Type **13** = Enter custom name

---

**That's it! Extract, install, run `npm run process 16`** 🎉
