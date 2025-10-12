# Documentation Hub

Welcome to the Magento 2 → Shopify Migration Suite documentation center. This directory contains comprehensive guides for migrating your e-commerce data from Magento 2 to Shopify.

## 📋 Documentation Index

### Migration Guides

| Guide | Description | Use Case |
|-------|-------------|----------|
| **[Migration Scripts Overview](./MIGRATION_SCRIPTS.md)** | Complete migration workflow, architecture, and shared utilities | Understanding the migration process |
| **[Customer Migration Guide](./CUSTOMER_MIGRATION.md)** | Detailed customer migration process with address parsing and tagging | Migrating customer data and profiles |
| **[Original Italian Guide](./README_IT.md)** | Comprehensive Italian documentation (original) | Italian-speaking developers |

### Development & Tools

| Guide | Description | Use Case |
|-------|-------------|----------|
| **[Development Guide (WARP.md)](./WARP.md)** | Architecture, development commands, and API integration details | Developers working with the codebase |
| **[Utilities Documentation](./UTILITIES.md)** | Complete documentation of all utility functions and classes | Understanding and extending utilities |
| **[CSV Analysis Tools](./ColumnContentExtractor_Examples.md)** | Advanced CSV filtering, value matching, and data exploration | Data preparation and analysis |

## 🚀 Quick Navigation

### For First-Time Users
1. Start with the main [README.md](../README.md) for project overview
2. Review [Migration Scripts Overview](./MIGRATION_SCRIPTS.md) to understand the architecture
3. Check [CSV Analysis Tools](./ColumnContentExtractor_Examples.md) to prepare your data
4. Follow the specific migration guides for your needs

### For Developers
1. Read the [Development Guide (WARP.md)](./WARP.md) for architecture and commands
2. Explore the migration scripts to understand the workflow
3. Use the CSV analysis tools for data validation and preparation

### For Data Migration
1. Use [CSV Analysis Tools](./ColumnContentExtractor_Examples.md) to analyze and filter your data
2. Follow the [Customer Migration Guide](./CUSTOMER_MIGRATION.md) for customer data
3. Refer to the main [README.md](../README.md) for product migration

## 🔧 Available Tools

### CSV Analysis & Filtering Tools

The suite includes powerful CSV analysis tools accessible via Task runner:

#### Content-Based Extraction
```bash
# Extract products with descriptions
go-task csv:extract-by-column COLUMN=description

# Count products with categories  
go-task csv:extract-by-column COLUMN=categories COUNT_ONLY=true
```

#### Exact Value Matching
```bash
# Extract all enabled products
go-task csv:extract-by-value COLUMN=status VALUE=Enabled

# Find simple products only
go-task csv:extract-by-value COLUMN=product_type VALUE=simple
```

#### Substring Matching
```bash
# Find products containing "iPhone"
go-task csv:extract-by-contains COLUMN=name SUBSTRING=iPhone

# Case-insensitive manufacturer search
go-task csv:extract-by-contains COLUMN=manufacturer SUBSTRING=apple CASE_INSENSITIVE=true
```

#### Basic Operations
```bash
# List available columns
go-task csv:extract-by-column -- --list-columns

# Count rows
go-task csv:count-rows

# Search for specific terms
go-task csv:search TERM=BIX.A-REM-70S
```

### Migration Tools

#### Product Migration
```bash
# Using Docker (recommended)
docker compose up

# Direct execution
npm run migrate-products
```

#### Customer Migration  
```bash
# Using Docker
docker compose run --rm migration npm run migrate-customers

# Direct execution
npm run migrate-customers
```

## 📊 Documentation Structure

```
docs/
├── README.md                           # This documentation hub
├── MIGRATION_SCRIPTS.md                # Migration overview and architecture
├── CUSTOMER_MIGRATION.md               # Customer migration detailed guide
├── WARP.md                            # Development guide and commands
├── UTILITIES.md                        # Complete utilities documentation
├── ColumnContentExtractor_Examples.md  # CSV analysis tools documentation
└── README_IT.md                       # Original Italian documentation
```

## 🎯 Migration Workflow

1. **Data Preparation**
   - Export CSV files from Magento 2
   - Use CSV analysis tools to validate and filter data
   - Identify products/customers for migration

2. **Environment Setup**
   - Configure `.env` with Shopify credentials
   - Set batch processing parameters
   - Prepare Docker environment

3. **Migration Execution**
   - Start with small test batches
   - Run product and customer migrations
   - Monitor progress and handle errors

4. **Validation**
   - Verify migrated data in Shopify
   - Check logs for any issues
   - Re-run for any failed items

## 🔍 Key Features Across All Tools

- ✅ **Docker Integration**: All tools run in consistent containerized environment
- ✅ **Task Runner Integration**: Convenient go-task commands for all operations
- ✅ **Batch Processing**: Handle large datasets efficiently
- ✅ **Progress Tracking**: Real-time progress and performance metrics
- ✅ **Error Handling**: Graceful failure handling with detailed logging
- ✅ **Idempotent Operations**: Safe to run multiple times
- ✅ **Rate Limiting**: Automatic Shopify API rate limit handling

## 📞 Getting Help

- Check the specific guide for your use case
- Review logs in `./logs/` directory
- Consult [Shopify GraphQL Admin API Docs](https://shopify.dev/docs/api/admin-graphql)
- Test with small datasets before full migration

---

Choose the appropriate guide from the index above based on your specific needs!