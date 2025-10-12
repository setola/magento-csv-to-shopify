# Migration Scripts Overview

This directory contains a complete suite for migrating data from Magento 2 to Shopify.

## 📁 Files Structure

### Main Migration Scripts
- **`product-migrate.js`** - Product migration (products, variants, images, inventory)
- **`customer-migrate.js`** - Customer migration (customers, addresses, marketing consent)

### Shared Utilities (`utils/`)
- **`ShopifyClient.js`** - GraphQL API client with rate limiting
- **`CSVParser.js`** - CSV parsing and batch processing
- **`RateLimiter.js`** - Concurrent request management
- **`Normalizers.js`** - Data normalization (products only)
- **`Logger.js`** - Structured logging
- **`TimeTracker.js`** - Performance tracking

### Configuration Files
- **`package.json`** - Scripts: `migrate-products`, `migrate-customers`
- **`compose.yml`** - Docker Compose configuration
- **`Dockerfile`** - Container setup
- **`.env`** - Environment variables (create from `.env.example`)

### Documentation
- **`README.md`** - Main documentation and product migration guide
- **`CUSTOMER_MIGRATION.md`** - Detailed customer migration guide
- **`MIGRATION_SCRIPTS.md`** - This overview file

## 🚀 Quick Start

### Product Migration
```bash
# Configure products CSV path
CSV_PATH=./data/products.csv npm run migrate-products
```

### Customer Migration  
```bash
# Configure customers CSV path
CUSTOMERS_CSV_PATH=./data/export_customers.csv npm run migrate-customers
```

### Using Docker
```bash
# Product migration
docker compose run --rm migration npm run migrate-products

# Customer migration  
docker compose run --rm migration npm run migrate-customers
```

## ⚙️ Environment Variables

```env
# Required for both migrations
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your-access-token

# Product migration
CSV_PATH=./data/products.csv
MAGENTO_BASE_URL=https://your-magento-site.com
SHOPIFY_LOCATION_ID=gid://shopify/Location/123456

# Customer migration
CUSTOMERS_CSV_PATH=./data/export_customers.csv

# Batch processing
START_ROW=0
BATCH_SIZE=100  # Use 50 for customers
MAX_CONCURRENT=2
DELAY_MS=500
```

## 🔧 CSV Analysis and Data Preparation

Before running migrations, use the powerful CSV analysis tools to prepare and validate your data:

### Basic Analysis
```bash
# Count total rows
go-task csv:count-rows

# List all available columns
go-task csv:extract-by-column -- --list-columns

# Get distinct values for a column
go-task csv:distinct COLUMN=product_type COUNT=true SORT=true
```

### Advanced Filtering
```bash
# Extract products with descriptions (content-based)
go-task csv:extract-by-column COLUMN=description

# Extract products by exact status value
go-task csv:extract-by-value COLUMN=status VALUE=Enabled OUTPUT=enabled_products.csv

# Find products containing specific text
go-task csv:extract-by-contains COLUMN=name SUBSTRING=iPhone CASE_INSENSITIVE=true

# Search for specific SKUs
go-task csv:search TERM=BIX.A-REM-70S
```

### Data Validation Examples
```bash
# Count products without descriptions
go-task csv:extract-by-column COLUMN=description COUNT_ONLY=true

# Find disabled products
go-task csv:extract-by-value COLUMN=status VALUE=Disabled COUNT_ONLY=true

# Identify products by manufacturer
go-task csv:extract-by-contains COLUMN=manufacturer SUBSTRING=Apple COUNT_ONLY=true
```

## 🔄 Code Architecture

Both migration scripts follow the same pattern:

1. **Configuration**: Environment variables and constants
2. **Utilities**: Shared services (API client, CSV parser, rate limiter)
3. **Data Normalization**: Format conversion (Magento → Shopify)
4. **Processing Logic**: Create/update operations with error handling
5. **Batch Execution**: Rate-limited parallel processing
6. **Progress Tracking**: Real-time statistics and timing

### Shared Utilities System

The migration suite includes a comprehensive utilities system:

#### Core Migration Utilities
- **`ShopifyClient.js`**: GraphQL API client with rate limiting
- **`CSVParser.js`**: CSV parsing and batch processing
- **`RateLimiter.js`**: Concurrent request management
- **`Normalizers.js`**: Data normalization (products only)
- **`Logger.js`**: Structured logging
- **`TimeTracker.js`**: Performance tracking

#### CSV Analysis Utilities
- **`ColumnContentExtractor.js`**: Advanced CSV filtering with value matching
- **`DistinctValueExtractor.js`**: Extract unique values from columns
- **`CSVRowCounter.js`**: Count rows in CSV files

### Benefits of Shared Utilities

- **No Code Duplication**: Common functionality extracted to utils
- **Consistent Behavior**: Same rate limiting and error handling
- **Easy Maintenance**: Single place to update shared logic
- **Scalable**: Easy to add new migration types
- **Powerful Analysis**: Advanced CSV filtering and data exploration

## 📊 Performance

- **Rate Limiting**: Respects Shopify's 2 req/sec GraphQL limit
- **Concurrent Processing**: Configurable parallel requests
- **Batch Processing**: Handle large datasets efficiently
- **Progress Tracking**: Real-time timing and statistics
- **Error Recovery**: Individual failures don't stop the batch

## 🎯 Migration Strategy

1. **Test with small batches** first (10-50 items)
2. **Check logs** for any validation errors
3. **Scale up batch sizes** once confident
4. **Monitor API usage** to avoid hitting limits
5. **Use idempotent operations** (safe to re-run)