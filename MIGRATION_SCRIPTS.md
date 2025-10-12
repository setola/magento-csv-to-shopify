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

## 🔄 Code Architecture

Both migration scripts follow the same pattern:

1. **Configuration**: Environment variables and constants
2. **Utilities**: Shared services (API client, CSV parser, rate limiter)
3. **Data Normalization**: Format conversion (Magento → Shopify)
4. **Processing Logic**: Create/update operations with error handling
5. **Batch Execution**: Rate-limited parallel processing
6. **Progress Tracking**: Real-time statistics and timing

### Benefits of Shared Utilities

- **No Code Duplication**: Common functionality extracted to utils
- **Consistent Behavior**: Same rate limiting and error handling
- **Easy Maintenance**: Single place to update shared logic
- **Scalable**: Easy to add new migration types

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