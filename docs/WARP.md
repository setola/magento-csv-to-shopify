# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Magento 2 to Shopify migration suite using Node.js and Shopify's GraphQL Admin API. Migrates products and customers from Magento 2 CSV exports with advanced CSV analysis tools.

**Core Scripts:**
- `product-migrate.js` - Products with variants, images, inventory, SEO
- `customer-migrate.js` - Customers with addresses, phone numbers, marketing consent
- `product-delete.js` - Product deletion by SKU from CSV

**Utils Library (`utils/`):**
- `ShopifyClient.js` - GraphQL client with rate limiting and API cost tracking
- `CSVParser.js` - CSV parsing with batch processing (uses papaparse)
- `RateLimiter.js` - Concurrent request limiting with p-limit
- `Normalizers.js` / `CustomerNormalizers.js` - Data transformation Magento→Shopify
- `Logger.js` - Dual console+file logging
- `TimeTracker.js` - Performance monitoring
- CSV Analysis: `ColumnContentExtractor.js`, `DistinctValueExtractor.js`, `CSVRowCounter.js`

## Development Commands

### Initial Setup
```bash
cp .env.example .env  # Configure Shopify credentials, Magento URLs
mkdir -p logs data    # Create required directories
```

### Migration Execution

**Using Taskfile (recommended):**
```bash
go-task migration:products                    # Full product migration
go-task migration:customers                   # Customer migration
go-task migration:products START_ROW=100 BATCH_SIZE=500  # Batch control
```

**Using npm directly:**
```bash
npm run migrate-products   # Direct Node.js execution
npm run migrate-customers
npm run delete-products    # Delete products by SKU from CSV
```

**Docker execution (for debugging):**
```bash
docker run --rm -it --workdir /app --volume "$(pwd):/app" --env-file .env node:alpine sh
```

### CSV Analysis Tools

**Basic operations:**
```bash
go-task csv:count-rows                              # Count CSV rows
go-task csv:extract-by-column -- --list-columns     # Show available columns
go-task csv:search TERM=SKU123                      # Full-text search
go-task csv:search-sku SKU=EXACT-SKU                # Exact SKU match
```

**Advanced filtering:**
```bash
go-task csv:extract-by-value COLUMN=status VALUE=Enabled
go-task csv:extract-by-contains COLUMN=name SUBSTRING=iPhone CASE_INSENSITIVE=true
go-task csv:distinct COLUMN=product_type COUNT=true SORT=true
go-task csv:extract-by-column COLUMN=description OUTPUT=with_desc.csv
```

**Test workflows:**
```bash
go-task csv:extract-test-products  # Create products_test.csv with specific SKUs
go-task delete:test-products       # Delete test products from Shopify
```

### Monitoring and Debugging
```bash
go-task migration:progress         # Follow progress in real-time
tail -f logs/migration.log         # Watch full log
grep ERROR logs/migration.log      # Find errors
grep "✓ Created product" logs/migration.log | wc -l  # Count successes
```

## Architecture

### Design Pattern: Modular Utility-Based

**Separation of concerns:**
1. Main scripts orchestrate workflow (parse CSV → normalize → API calls)
2. Utilities handle cross-cutting concerns (logging, rate limiting, API interaction)
3. Normalizers encapsulate Magento→Shopify field mapping logic
4. Configuration via environment variables

**Key architectural principles:**
- **Idempotent operations**: Migrations use SKU/email lookups to update existing records
- **GraphQL-first**: Uses Shopify Admin API 2024-10 (not deprecated REST API)
- **Rate limit aware**: Monitors GraphQL cost and throttles automatically
- **Batch processing**: Supports START_ROW/BATCH_SIZE for large datasets
- **Docker-first**: All tasks run in containers for consistency

### Data Flow

```
CSV Export (Magento) 
  → CSVParser.js (batch load with papaparse)
  → Normalizers.js (field transformation)
  → ShopifyClient.findProductBySku() (check existing)
  → Create/Update mutation via ShopifyClient.query()
  → RateLimiter (concurrent control with p-limit)
  → Logger (console + file output)
```

### Product Migration Specifics

**Price logic:**
- If `special_price` < `price`: use `special_price` as price, `price` as `compareAtPrice`
- Otherwise: use `price` directly

**Publication logic:**
- Products with `qty > 0` are published immediately
- Products with `qty === 0` remain as drafts

**Category mapping:**
- Magento categories → Shopify tags (normalized to lowercase)
- Attempts mapping to Shopify taxonomy (`gid://shopify/ProductTaxonomyNode/{path}`)

**Image handling:**
- Constructs full URLs: `MAGENTO_BASE_URL + MAGENTO_MEDIA_PATH + relative_path`
- Deletes existing images before adding new ones (avoids duplicates)

**SEO fields:**
- `meta_title` → SEO title (fallback: product name)
- `meta_description` → SEO description
- `url_key` → Shopify handle

### Customer Migration Specifics

**Address parsing:**
- Splits combined address fields intelligently
- Maps Italian province codes to full names

**Phone normalization:**
- Handles Italian format: `+39 prefix number`
- International format detection

**Marketing consent:**
- Magento `confirmed` → Shopify `emailMarketingConsent`

### Error Handling

- Individual failures don't stop batch processing
- All errors logged with SKU/email identifiers for recovery
- GraphQL `userErrors` are caught and logged
- Rate limit errors trigger automatic backoff

## Environment Variables

### Required
```env
SHOPIFY_STORE_URL=store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxx
SHOPIFY_LOCATION_ID=gid://shopify/Location/xxx  # For inventory
MAGENTO_BASE_URL=https://www.magento-store.com
```

### CSV Paths
```env
CSV_PATH=./products.csv                          # Auto-discovered in data/
CUSTOMERS_CSV_PATH=./data/export_customers.csv
DELETE_CSV_PATH=./data/products_test.csv         # For deletion script
```

### Batch Control
```env
START_ROW=0       # Skip first N rows
BATCH_SIZE=100    # Products: 100-500, Customers: 50, Delete: 25
```

### Rate Limiting
```env
MAX_CONCURRENT=2  # Concurrent API requests (keep ≤ 2)
DELAY_MS=500      # Delay between requests (increase if rate limited)
```

### Optional
```env
MAGENTO_MEDIA_PATH=/pub/media/catalog/product
NODE_IMAGE=node:alpine  # Docker image for tasks
```

## Shopify API Details

**API Version:** `2024-10` (hardcoded in `ShopifyClient.js`)

**Rate Limits:**
- GraphQL: 2 requests/second per store
- Cost-based: 1000 points per 10-second bucket
- `ShopifyClient` monitors `extensions.cost.throttleStatus.currentlyAvailable`
- Auto-waits if available points < 100

**Required Scopes:**
- `write_products`, `read_products`
- `write_inventory`
- `write_customers`, `read_customers`

**GraphQL Mutations Used:**
- `productCreate`, `productUpdate`, `productDelete`
- `productCreateMedia`, `productDeleteMedia`
- `productVariantUpdate`, `inventorySetOnHandQuantities`
- `customerCreate`, `customerUpdate`

## Working with Large Datasets

**Strategy for 15,000+ products:**
```bash
# Test first with small batch
START_ROW=0 BATCH_SIZE=10 go-task migration:products

# Then process in chunks
START_ROW=0 BATCH_SIZE=500 go-task migration:products
START_ROW=500 BATCH_SIZE=500 go-task migration:products
START_ROW=1000 BATCH_SIZE=500 go-task migration:products
```

**Performance monitoring:**
- Progress logged every 10 items
- Metrics: items/second, elapsed time, estimated completion
- Final stats: total/success/failure counts

## Taskfile Structure

**Global variables (Taskfile.yml):**
- `CSV_DIR`, `CSV_FILE` (auto-discovers `export_catalog_product_*.csv`)
- `NODE_IMAGE` (default: `node:alpine`)
- Flags: `OUTPUT_FLAG`, `COUNT_ONLY_FLAG`, `CASE_INSENSITIVE_FLAG`

**Task naming convention:**
- `csv:*` - CSV analysis utilities
- `migration:*` - Migration execution
- `delete:*` - Product deletion

**All tasks run in Docker containers** with volume mount `$(pwd):/app` and `--env-file .env`

## Code Patterns to Follow

**When adding new migrations:**
1. Use `ShopifyClient.query()` for all GraphQL calls
2. Implement find-by-identifier method (SKU, email, etc.)
3. Use `Normalizers` pattern for data transformation
4. Log at INFO level for user-facing messages, DEBUG for details
5. Wrap in `RateLimiter` if making concurrent calls
6. Handle `userErrors` from GraphQL responses

**When adding CSV utilities:**
1. Use `papaparse` for CSV parsing (already in dependencies)
2. Support `--list-columns`, `--help` flags
3. Accept `OUTPUT`, `COUNT_ONLY`, `CASE_INSENSITIVE` options
4. Add corresponding task in `Taskfile.yml` with detailed `summary:`

**Logger usage:**
- `log(message, 'INFO')` - Normal progress
- `log(message, 'SUCCESS')` - Completed operations (✓ prefix)
- `log(message, 'WARN')` - Warnings (rate limits, missing data)
- `log(message, 'ERROR')` - Failures (✗ prefix)
- `log(message, 'DEBUG')` - Detailed information (↳ prefix)

## Testing Workflow

**Before production migration:**
1. Extract test products: `go-task csv:extract-test-products`
2. Migrate test batch: `CSV_PATH=./data/products_test.csv go-task migration:products`
3. Verify in Shopify admin
4. Delete test products: `go-task delete:test-products`
5. Repeat with larger batch (50-100 items)
6. Run full migration with monitoring

## Important Notes

- **Never commit to git unless explicitly requested** - migrations are data operations, not code changes
- **CSV file discovery** - Tasks auto-find `export_catalog_product_*.csv` in `data/` directory
- **Docker isolation** - All commands run in containers; no need for local Node.js installation
- **Idempotency** - Safe to re-run migrations; existing items are updated, not duplicated
- **Language** - All code/comments should be in English (some legacy Italian comments exist)
