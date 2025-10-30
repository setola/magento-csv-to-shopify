# Paganini CSV Import Feature

This feature imports products from Paganini semicolon-separated CSV files to Shopify, with vendor filtering and data normalization.

## Overview

The Paganini import filters products by vendor (only LEUPOLD) and normalizes the data according to specific rules:

- **SKU Generation**: `[First 3 letters of vendor].[Product code]` (e.g., `LEU.90011`)
- **Price Normalization**: Italian format (comma as decimal separator) to Shopify decimal format
- **HTML Stripping**: Removes HTML tags from descriptions, replaces `<br>` with spaces
- **Availability Mapping**: A=1, B=4, C=10, other=0
- **Title Normalization**: Lowercase with first letter capitalized

## CSV Format

The Paganini CSV file uses **semicolon (;)** as separator and contains these columns:

| Column | Usage |
|--------|-------|
| `Produttore` | Vendor (filtered for "LEUPOLD") |
| `Codice_Produttore` | Product code (used in SKU generation) |
| `Anagrafica_Paganini` | Product title (normalized) |
| `Descrittivo_Paganini` | Product description (HTML stripped) |
| `Prezzo` | Cost price |
| `Prezzo_pubblico` | Public price |
| `Disponibilita` | Availability code (A/B/C) |

## Usage

### Quick Start

```bash
# Import with default settings (first 50 products)
go-task migration:paganini

# Specify CSV file explicitly
go-task migration:paganini PAGANINI_CSV_PATH=./data/paganini_data_2025-10-24T19-19-23.csv

# Process a larger batch
go-task migration:paganini BATCH_SIZE=100

# Resume from a specific row
go-task migration:paganini START_ROW=100 BATCH_SIZE=50
```

### Using npm directly

```bash
npm run migrate-paganini
```

### Environment Variables

Configure in `.env` file:

```env
# Paganini CSV Configuration
PAGANINI_CSV_PATH=./data/paganini_data_*.csv

# Shopify Configuration
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxx
SHOPIFY_LOCATION_ID=gid://shopify/Location/xxx

# Batch Configuration
START_ROW=0
BATCH_SIZE=50

# Rate Limiting
MAX_CONCURRENT=2
DELAY_MS=500
```

## Data Normalization

### SKU Generation

```javascript
// Example: LEUPOLD + 90011 = LEU.90011
vendor: "LEUPOLD"
productCode: "90011"
sku: "LEU.90011"
```

### Price Normalization

Handles Italian number format (comma as decimal separator):

```javascript
// Input examples
"66.698"    → "66.70"   // European format with dot thousands
"66,698"    → "66.70"   // Comma as decimal
"1.234,56"  → "1234.56" // European format with thousands separator
```

### Title Normalization

```javascript
// Input
"PRESSA LEE LOAD ALL II COMPLETA CAL.12 90011"

// Output
"Pressa lee load all ii completa cal.12 90011"
```

### Description HTML Stripping

```javascript
// Input
"La pressa include 24 boccole<br />per la polvere"

// Output
"La pressa include 24 boccole per la polvere"
```

### Availability Mapping

| Code | Quantity |
|------|----------|
| A    | 1        |
| B    | 4        |
| C    | 10       |
| Other| 0        |

## Architecture

### Files Created

1. **`utils/PaganiniNormalizer.js`** - Data normalization class
   - Vendor filtering (`shouldImport()`)
   - SKU generation (`generateSKU()`)
   - Price normalization (`normalizePrice()`)
   - HTML stripping (`normalizeDescription()`)
   - Availability mapping (`normalizeAvailability()`)

2. **`paganini-migrate.js`** - Main migration script
   - CSV parsing (semicolon-separated)
   - Product creation/updating
   - Inventory management
   - Rate limiting and progress tracking

### Class Hierarchy

```
PaganiniNormalizer
├── shouldImport()           // Filter LEUPOLD products
├── generateSKU()            // Build SKU from vendor + code
├── normalizeTitle()         // Format product title
├── normalizeDescription()   // Strip HTML tags
├── normalizePrice()         // Convert price format
├── normalizeAvailability()  // Map availability codes
└── buildProductData()       // Compile all normalized data
```

## Workflow

1. **Parse CSV** - Read semicolon-separated CSV file
2. **Filter** - Only process LEUPOLD vendor products
3. **Normalize** - Transform data according to rules
4. **Check Existence** - Search for product by SKU
5. **Create/Update** - Create new or update existing product
6. **Set Inventory** - Update inventory quantity
7. **Track Progress** - Log results and statistics

## Testing

### Test with Small Batch

```bash
# Process only first 5 rows
go-task migration:paganini BATCH_SIZE=5
```

### Check Logs

```bash
# View log file location
tail -f logs/migration-*.log

# Search for specific product
grep "LEU.90011" logs/migration-*.log
```

### Verify Import

Check the Shopify admin for:
- Product title formatting
- Description without HTML tags
- Correct vendor (LEUPOLD)
- Proper inventory quantities
- SKU format (LEU.xxxxx)

## Troubleshooting

### No products imported

- Check vendor filter: Only LEUPOLD products are imported
- Verify CSV format: Must be semicolon-separated
- Check column names match exactly

### Price formatting issues

- Ensure prices in CSV are valid numbers
- Check for currency symbols (should be handled)
- Verify decimal separator handling

### SKU conflicts

- Products with same SKU will be updated, not duplicated
- Check `Codice_Produttore` column for unique values

### Rate limiting

- Reduce `MAX_CONCURRENT` to 1
- Increase `DELAY_MS` to 1000 or higher
- Process smaller batches

## Integration with Existing Tools

The Paganini import reuses existing project utilities:

- **Logger** - Dual console + file logging
- **ShopifyClient** - GraphQL API with rate limiting
- **RateLimiter** - Concurrent request management
- **TimeTracker** - Performance monitoring

## Future Enhancements

Possible improvements:

- [ ] Support multiple vendor filters
- [ ] Product images import
- [ ] Product tags/categories
- [ ] SEO metadata handling
- [ ] Variant support
- [ ] Bulk operations optimization
