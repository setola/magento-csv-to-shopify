# Magento 2 → Shopify Migration Suite

Complete suite for migrating data from Magento 2 to Shopify using GraphQL Admin API.

## 🎯 Overview

This is a **Magento 2 to Shopify migration suite** built in Node.js that provides specialized migration tools using Shopify's GraphQL Admin API to migrate products and customers from Magento 2 CSV exports to Shopify stores.

### Core Components

- **`product-migrate.js`**: Migrates products with variants, images, inventory, and SEO data
- **`customer-migrate.js`**: Migrates customers with addresses, phone numbers, and marketing consent
- **Utils library** (`utils/`): Shared utilities for Shopify API client, CSV parsing, rate limiting, logging, and data normalization

## 🚀 Quick Start

### Prerequisites

1. Docker and Docker Compose installed
2. CSV exported from Magento 2
3. Shopify Admin API access with required scopes:
   - `write_products` / `read_products`
   - `write_inventory` 
   - `write_customers` / `read_customers`

### Setup

1. **Clone and setup environment:**
```bash
cp .env.example .env
# Edit .env with your Shopify credentials and Magento URLs
mkdir -p logs
```

2. **Configure environment variables:**
```env
# Required
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxx
SHOPIFY_LOCATION_ID=gid://shopify/Location/xxxxxxxxxxxxx
MAGENTO_BASE_URL=https://www.your-magento-store.com

# CSV files
CSV_PATH=./products.csv
CUSTOMERS_CSV_PATH=./data/export_customers.csv

# Batch processing
START_ROW=0
BATCH_SIZE=100
```

### Run Migration

#### Products Migration
```bash
# Using Docker (recommended)
docker compose up

# Using npm
npm run migrate-products
```

#### Customer Migration
```bash
# Using Docker
docker compose run --rm migration npm run migrate-customers

# Using npm  
npm run migrate-customers
```

## 🔧 CSV Analysis Tools

This suite includes powerful CSV analysis tools accessible via Task runner:

### Basic Operations
```bash
# Count rows in CSV files
go-task csv:count-rows

# List available columns
go-task csv:extract-by-column -- --list-columns

# Search for specific products
go-task csv:search TERM=BIX.A-REM-70S
```

### Advanced Filtering
```bash
# Extract products by exact status value
go-task csv:extract-by-value COLUMN=status VALUE=Enabled

# Find products containing specific text
go-task csv:extract-by-contains COLUMN=name SUBSTRING=iPhone

# Case-insensitive search
go-task csv:extract-by-contains COLUMN=manufacturer SUBSTRING=apple CASE_INSENSITIVE=true
```

## 📊 Key Features

- ✅ **GraphQL-first**: Uses modern Shopify GraphQL Admin API (not deprecated REST)
- ✅ **Idempotent Operations**: Safe to run multiple times (creates and updates)
- ✅ **Intelligent Rate Limiting**: Automatic Shopify API rate limit handling
- ✅ **Batch Processing**: Handle large datasets efficiently
- ✅ **Docker Support**: Containerized execution for consistency
- ✅ **Comprehensive Logging**: Detailed progress tracking and error reporting
- ✅ **CSV Analysis Tools**: Advanced filtering and data exploration capabilities

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[Migration Guide](./docs/MIGRATION_SCRIPTS.md)** | Complete migration workflow and architecture |
| **[Customer Migration](./docs/CUSTOMER_MIGRATION.md)** | Detailed customer migration process |
| **[CSV Analysis Tools](./docs/ColumnContentExtractor_Examples.md)** | Advanced CSV filtering and analysis |
| **[Development Guide](./docs/WARP.md)** | Architecture, development commands, and API details |
| **[Italian Documentation](./docs/README_IT.md)** | Original Italian documentation |

## 🎯 Migration Strategy

### For Large Datasets (15,000+ products)

1. **Test with small batches** first (10-50 items)
2. **Use sequential batches:**
```bash
# Batch 1: rows 0-499
START_ROW=0 BATCH_SIZE=500 npm run migrate-products

# Batch 2: rows 500-999  
START_ROW=500 BATCH_SIZE=500 npm run migrate-products
```

3. **Monitor progress:**
```bash
tail -f logs/migration.log
go-task migration:progress
```

### Data Validation and Preparation

Use the CSV analysis tools to prepare your data:

```bash
# Find products without descriptions
go-task csv:extract-by-column COLUMN=description COUNT_ONLY=true

# Extract only enabled products for migration
go-task csv:extract-by-value COLUMN=status VALUE=Enabled OUTPUT=enabled_products.csv

# Find products by category
go-task csv:extract-by-contains COLUMN=categories SUBSTRING=Electronics
```

## 🔍 Rate Limits & Performance

The migration automatically handles Shopify's API limits:

- **GraphQL API**: 2 requests/second per store maximum
- **Cost-based limiting**: Max 1000 points per 10-second window
- **Automatic backoff**: Built-in rate limit detection and retry logic

## 🐛 Troubleshooting

Common issues and solutions:

- **Access token invalid**: Check token and required scopes
- **Location not found**: Use format `gid://shopify/Location/xxxxx`
- **Images not loading**: Verify `MAGENTO_BASE_URL` and image accessibility
- **Rate limit exceeded**: Increase `DELAY_MS` or reduce `MAX_CONCURRENT`

## 📞 Support

- Check detailed logs in `./logs/migration.log`
- Consult [Shopify GraphQL Admin API Docs](https://shopify.dev/docs/api/admin-graphql)
- Review documentation in the `./docs/` directory

---

**⚠️ Important**: Always test with a small subset of data (10-20 items) before running the full migration!