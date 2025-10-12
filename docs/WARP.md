# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a **Magento 2 to Shopify migration suite** built in Node.js. It provides two specialized migration tools that use Shopify's GraphQL Admin API to migrate products and customers from Magento 2 CSV exports to Shopify stores.

### Core Components

- **`product-migrate.js`**: Migrates products with variants, images, inventory, and SEO data
- **`customer-migrate.js`**: Migrates customers with addresses, phone numbers, and marketing consent
- **Utils library** (`utils/`): Shared utilities for Shopify API client, CSV parsing, rate limiting, logging, and data normalization

## Development Commands

### Setup and Configuration
```bash
# Copy environment template and configure
cp .env.example .env
# Edit .env with your Shopify credentials and Magento URLs

# Install dependencies
npm install

# Create logs directory
mkdir -p logs
```

### Migration Execution
```bash
# Run product migration (via npm)
npm run migrate-products

# Run customer migration (via npm) 
npm run migrate-customers

# Run with Docker (recommended for production)
go-task migration:products

# Run customer migration with Docker
go-task migration:customers

# Run in interactive mode for debugging
docker run --rm -it --workdir /app --volume "$(pwd):/app" --env-file .env node:alpine sh
```

### CSV Analysis (using Task runner)
```bash
# Count rows in CSV files
go-task csv:count-rows

# List available columns
go-task csv:extract-by-column -- --list-columns

# Search for specific products
go-task csv:search TERM=BIX.A-REM-70S

# Search by exact SKU
go-task csv:search-sku SKU=DAA.100358

# Extract products by content (original functionality)
go-task csv:extract-by-column COLUMN=description

# Extract products by exact value
go-task csv:extract-by-value COLUMN=status VALUE=Enabled

# Extract products by substring
go-task csv:extract-by-contains COLUMN=name SUBSTRING=iPhone

# Case-insensitive matching
go-task csv:extract-by-contains COLUMN=manufacturer SUBSTRING=apple CASE_INSENSITIVE=true

# Get distinct values from columns
go-task csv:distinct COLUMN=product_type COUNT=true SORT=true

# Extract test products to separate CSV
go-task csv:extract-test-products

# Monitor migration progress
go-task migration:progress
```

### Development and Debugging
```bash
# View logs in real-time
tail -f logs/migration.log

# Search for errors
grep ERROR logs/migration.log

# Count successful migrations
grep "✓ Created product" logs/migration.log | wc -l

# Run single test (products.csv must exist)
npm test
```

## Architecture and Structure

### Migration Pattern
The codebase follows a **modular utility-based architecture**:

1. **Main Scripts** (`product-migrate.js`, `customer-migrate.js`): Orchestrate the migration flow
2. **Utilities** (`utils/`): Reusable components for common functionality
3. **Configuration-driven**: All behavior controlled via environment variables
4. **Batch Processing**: Built-in support for processing large datasets in chunks
5. **Rate Limiting**: Automatic Shopify API rate limit handling

### Key Architectural Decisions

- **Idempotent Operations**: Both migrations can be run multiple times safely
- **SKU-based Updates**: Products are identified by SKU for updates vs creation
- **Email-based Updates**: Customers are identified by email address
- **GraphQL-first**: Uses modern Shopify GraphQL Admin API (not deprecated REST)
- **Utility Classes**: Shared functionality extracted to reusable classes

### Utilities Architecture

- **`ShopifyClient.js`**: Handles GraphQL queries, rate limiting, and API interactions
- **`CSVParser.js`**: Generic CSV parsing with batch processing support
- **`RateLimiter.js`**: Concurrent request limiting with progress tracking
- **`Normalizers.js`**: Data transformation between Magento and Shopify formats
- **`Logger.js`**: Structured logging to both console and files
- **`TimeTracker.js`**: Performance monitoring and elapsed time tracking

### CSV Analysis Utilities

- **`ColumnContentExtractor.js`**: Advanced CSV filtering with three extraction modes:
  - Content-based: Extract rows where column has any non-empty content
  - Exact value matching: Extract rows where column equals specific value
  - Substring matching: Extract rows where column contains substring
  - Supports case-insensitive matching, batch processing, and file output
- **`DistinctValueExtractor.js`**: Extract unique values from CSV columns with counting and sorting
- **`CSVRowCounter.js`**: Simple row counting utility for CSV files

### Data Flow
1. **CSV Parsing**: Load and validate Magento export data
2. **Normalization**: Transform Magento fields to Shopify format
3. **API Discovery**: Check if product/customer already exists
4. **Create/Update**: Execute GraphQL mutations with proper error handling
5. **Post-processing**: Handle inventory, images, and related data

## Environment Variables

### Required Configuration
```env
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxx
SHOPIFY_LOCATION_ID=gid://shopify/Location/xxxxxxxxxxxxx
MAGENTO_BASE_URL=https://www.your-magento-store.com
```

### Batch Processing
```env
CSV_PATH=./products.csv
CUSTOMERS_CSV_PATH=./data/export_customers.csv
START_ROW=0           # Starting row for batch processing
BATCH_SIZE=100        # Products per batch (50 for customers)
```

### Performance Tuning
```env
MAX_CONCURRENT=2      # Concurrent API requests
DELAY_MS=500         # Delay between requests (increase if rate limited)
```

## Migration Strategy

### Products Migration
- **Field Mapping**: Automated mapping from Magento CSV to Shopify product structure
- **Price Handling**: Intelligent pricing logic - if `special_price` < `price`, uses `special_price` as main price and `price` as compareAtPrice ("Was" price)
- **Image Handling**: Constructs full image URLs from relative Magento paths
- **Inventory Management**: Sets quantities and enables/disables inventory tracking
- **SEO Migration**: Transfers meta titles, descriptions, and URL handles
- **Category Mapping**: Converts Magento categories to Shopify tags with taxonomy mapping

### Customer Migration
- **Address Parsing**: Intelligent parsing of combined address fields
- **Phone Normalization**: Handles Italian/international phone format conversion
- **Marketing Consent**: Maps confirmed email status to Shopify marketing preferences
- **Data Enrichment**: Adds customer tags based on registration year, country, etc.

### Error Handling and Recovery
- **Validation**: Pre-flight checks for required fields and data integrity
- **Graceful Failures**: Individual item failures don't stop batch processing
- **Detailed Logging**: Error tracking with product/customer identifiers for recovery
- **Retry Capability**: Built-in support for re-running failed items

## Working with Large Datasets

### Batch Processing Strategy
For migrating 15,000+ products, use sequential batches:
```bash
# Batch 1: rows 0-499
START_ROW=0 BATCH_SIZE=500 npm run migrate-products

# Batch 2: rows 500-999  
START_ROW=500 BATCH_SIZE=500 npm run migrate-products
```

### Monitoring and Progress
- Real-time progress updates every 10 items
- Performance metrics (items/second, elapsed time)
- Final statistics with success/failure counts
- Log file analysis for debugging

## Shopify API Considerations

### Rate Limits
- **GraphQL API**: 2 requests/second per store maximum
- **Cost-based Limiting**: Max 1000 points per 10-second window
- **Automatic Handling**: Built-in rate limit detection and backoff

### Required Shopify Permissions
- `write_products` (product creation/updates)
- `read_products` (product lookups)  
- `write_inventory` (inventory management)
- `write_customers` (customer creation/updates)
- `read_customers` (customer lookups)

### GraphQL Schema Version
Uses Shopify Admin API version **2024-10** for maximum compatibility with latest features.