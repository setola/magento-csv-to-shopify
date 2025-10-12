# Utility Functions Documentation

This document describes all utility functions and tools available in the Shopify Migration Suite.

## 📁 Utilities Overview

The `utils/` directory contains shared utility classes that provide common functionality across both product and customer migration scripts.

### Core Migration Utilities

| Utility | Purpose | Used By |
|---------|---------|---------|
| [`ShopifyClient.js`](#shopifyclientjs) | GraphQL API client with rate limiting | Product & Customer migration |
| [`CSVParser.js`](#csvparserjs) | CSV parsing with batch processing | Product & Customer migration |
| [`RateLimiter.js`](#ratelimiterjs) | Concurrent request limiting | Product & Customer migration |
| [`Logger.js`](#loggerjs) | Structured logging to console and files | All scripts |
| [`TimeTracker.js`](#timetrackerjs) | Performance monitoring and timing | All scripts |
| [`Normalizers.js`](#normalizersjs) | Data transformation (Magento → Shopify) | Product migration only |

### CSV Analysis Utilities

| Utility | Purpose | Task Commands |
|---------|---------|---------------|
| [`ColumnContentExtractor.js`](#columncontentextractorjs) | Advanced CSV row filtering and extraction | `csv:extract-by-*` |
| [`DistinctValueExtractor.js`](#distinctvalueextractorjs) | Extract unique values from columns | `csv:distinct` |
| [`CSVRowCounter.js`](#csvrowcounterjs) | Count rows in CSV files | `csv:count-rows` |

## 🔧 Core Migration Utilities

### ShopifyClient.js

Handles all communication with Shopify's GraphQL Admin API.

**Features:**
- Automatic rate limit detection and backoff
- GraphQL query execution with error handling
- Cost-based limiting (max 1000 points per 10 seconds)
- Request queuing and throttling

**Key Methods:**
```javascript
// Execute GraphQL query/mutation
await client.query(query, variables);

// Check if product exists by SKU
await client.findProductBySku(sku);

// Check if customer exists by email
await client.findCustomerByEmail(email);

// Create/update operations with automatic retry
await client.createProduct(productData);
await client.updateProduct(productId, productData);
```

**Usage:**
```javascript
import ShopifyClient from './utils/ShopifyClient.js';

const client = new ShopifyClient(
    process.env.SHOPIFY_STORE_URL,
    process.env.SHOPIFY_ACCESS_TOKEN
);
```

### CSVParser.js

Generic CSV parsing utility with support for batch processing.

**Features:**
- Automatic file discovery using glob patterns
- Batch row selection (start row + batch size)
- Header validation and column mapping
- Error handling for malformed CSV files

**Key Methods:**
```javascript
// Parse CSV with batch selection
const data = await parser.parseCsvBatch(filePath, startRow, batchSize);

// Get CSV headers
const headers = await parser.getCsvHeaders(filePath);

// Validate required columns
await parser.validateColumns(filePath, requiredColumns);
```

**Usage:**
```javascript
import CSVParser from './utils/CSVParser.js';

const parser = new CSVParser();
const products = await parser.parseCsvBatch('./products.csv', 0, 100);
```

### RateLimiter.js

Manages concurrent API requests with progress tracking.

**Features:**
- Configurable concurrency limit
- Request delay management
- Progress reporting every N items
- Performance metrics (items/second)

**Key Methods:**
```javascript
// Process items with rate limiting
await limiter.processWithLimit(items, processingFunction);

// Execute single item with delay
await limiter.executeWithDelay(processingFunction);
```

**Usage:**
```javascript
import RateLimiter from './utils/RateLimiter.js';

const limiter = new RateLimiter({
    maxConcurrent: 2,
    delayMs: 500,
    progressInterval: 10
});
```

### Logger.js

Structured logging utility for console and file output.

**Features:**
- Multiple log levels (INFO, SUCCESS, ERROR, DEBUG, WARN)
- File logging with timestamps
- Color-coded console output
- Performance logging

**Key Methods:**
```javascript
logger.info('Processing product: ' + sku);
logger.success('✓ Created product: ' + title);
logger.error('✗ Failed to create product: ' + error.message);
logger.debug('API response: ' + JSON.stringify(response));
```

**Usage:**
```javascript
import Logger from './utils/Logger.js';

const logger = new Logger('./logs/migration.log');
```

### TimeTracker.js

Performance monitoring and elapsed time tracking.

**Features:**
- Start/stop timing
- Lap time measurement
- Human-readable time formatting
- Performance metrics calculation

**Key Methods:**
```javascript
// Start tracking
tracker.start();

// Record lap time
const lapTime = tracker.lap();

// Get elapsed time
const elapsed = tracker.elapsed();

// Format time for display
const formatted = tracker.formatTime(elapsed);
```

### Normalizers.js

Data transformation utilities for converting Magento data to Shopify format.

**Features:**
- Price normalization (special_price logic)
- Image URL construction from relative paths
- Category to tags conversion
- SEO field mapping
- Inventory quantity formatting

**Key Methods:**
```javascript
// Normalize product data
const shopifyProduct = normalizeProductData(magentoRow);

// Build image URLs
const imageUrls = buildImageUrls(baseImage, additionalImages, baseUrl);

// Handle price logic
const pricing = normalizePricing(price, specialPrice);
```

## 📊 CSV Analysis Utilities

### ColumnContentExtractor.js

Advanced CSV filtering utility with three extraction modes.

**Extraction Modes:**

1. **Content-based** (original): Extract rows where column has any non-empty content
2. **Exact value matching**: Extract rows where column equals specific value
3. **Substring matching**: Extract rows where column contains substring

**Features:**
- Case-insensitive matching support
- Multiple output formats (console, file, count-only)
- Batch processing for large files
- Column validation and listing

**Task Commands:**
```bash
# Content-based extraction
go-task csv:extract-by-column COLUMN=description

# Exact value matching
go-task csv:extract-by-value COLUMN=status VALUE=Enabled

# Substring matching
go-task csv:extract-by-contains COLUMN=name SUBSTRING=iPhone

# Case-insensitive matching
go-task csv:extract-by-contains COLUMN=manufacturer SUBSTRING=apple CASE_INSENSITIVE=true
```

**Direct Usage:**
```bash
# Extract products with specific status
docker compose run --rm migration node utils/ColumnContentExtractor.js status ./products.csv --value "Enabled"

# Find products containing text
docker compose run --rm migration node utils/ColumnContentExtractor.js name ./products.csv --contains "iPhone" --case-insensitive
```

**Programmatic Usage:**
```javascript
import { extractRowsByValue, extractRowsByContains } from './utils/ColumnContentExtractor.js';

// Extract enabled products
const enabled = await extractRowsByValue('./products.csv', 'status', 'Enabled');

// Find iPhone products (case-insensitive)
const iphones = await extractRowsByContains('./products.csv', 'name', 'iPhone', ',', true);
```

### DistinctValueExtractor.js

Extract unique values from CSV columns with analysis options.

**Features:**
- Extract unique values from any column
- Count occurrences of each value
- Sort results alphabetically or by count
- Output to console or file

**Task Commands:**
```bash
# Extract distinct product types
go-task csv:distinct COLUMN=product_type

# Count and sort manufacturers
go-task csv:distinct COLUMN=manufacturer COUNT=true SORT=true

# Save results to file
go-task csv:distinct COLUMN=categories OUTPUT=categories.txt
```

**Direct Usage:**
```bash
docker compose run --rm migration node utils/DistinctValueExtractor.js manufacturer ./products.csv --count --sort
```

### CSVRowCounter.js

Simple utility to count rows in CSV files.

**Features:**
- Fast row counting without loading entire file
- Handles large CSV files efficiently
- Excludes header row from count

**Task Commands:**
```bash
# Count rows in main CSV file
go-task csv:count-rows

# Count rows in specific file
go-task csv:count-rows CSV_FILE=./custom.csv
```

**Direct Usage:**
```bash
docker compose run --rm migration node utils/CSVRowCounter.js ./products.csv
```

## 🔄 Integration Patterns

### Shared Utility Usage

All migration scripts follow this pattern:

```javascript
// 1. Initialize utilities
const client = new ShopifyClient(storeUrl, accessToken);
const parser = new CSVParser();
const limiter = new RateLimiter(config);
const logger = new Logger(logFile);
const tracker = new TimeTracker();

// 2. Parse CSV data
const data = await parser.parseCsvBatch(csvPath, startRow, batchSize);

// 3. Process with rate limiting
await limiter.processWithLimit(data, async (item) => {
    // Normalize data (products only)
    const normalized = normalizeData(item);
    
    // Execute API operations
    const result = await client.createOrUpdate(normalized);
    
    // Log results
    logger.success(`✓ Processed: ${item.id}`);
});

// 4. Report statistics
logger.info(`Migration complete: ${tracker.formatTime(tracker.elapsed())}`);
```

### Error Handling Pattern

All utilities implement consistent error handling:

```javascript
try {
    // Attempt operation
    const result = await operation();
    logger.success('✓ Operation successful');
} catch (error) {
    // Log error but continue processing
    logger.error(`✗ Operation failed: ${error.message}`);
    // Don't throw - let batch continue
}
```

## 🎯 Best Practices

### For Developers

1. **Use Shared Utilities**: Don't duplicate functionality, extend existing utilities
2. **Follow Error Patterns**: Log errors but don't stop batch processing
3. **Implement Rate Limiting**: Always use RateLimiter for API operations
4. **Add Progress Tracking**: Use TimeTracker and Logger for user feedback

### For Data Analysis

1. **Start with Column Listing**: Use `--list-columns` to explore CSV structure
2. **Use Count-Only Mode**: Test filters with `COUNT_ONLY=true` before extraction
3. **Combine Tools**: Use multiple utilities to prepare and validate data
4. **Export for Review**: Use `OUTPUT=file.csv` to save filtered results

### Performance Considerations

- **Batch Processing**: Always use appropriate batch sizes (100 for products, 50 for customers)
- **Rate Limiting**: Respect Shopify's API limits with proper delays
- **Memory Management**: Use streaming for large CSV files
- **Progress Monitoring**: Track performance and adjust parameters as needed

## 📞 Extending Utilities

To add new utilities:

1. Follow existing patterns and naming conventions
2. Implement proper error handling
3. Add Task runner integration
4. Document usage and examples
5. Add to this documentation

Example utility template:
```javascript
import Logger from './Logger.js';

class NewUtility {
    constructor(options = {}) {
        this.logger = new Logger();
        this.options = options;
    }
    
    async performOperation(data) {
        try {
            // Implementation here
            this.logger.success('✓ Operation completed');
            return result;
        } catch (error) {
            this.logger.error(`✗ Operation failed: ${error.message}`);
            throw error;
        }
    }
}

export default NewUtility;
```

This comprehensive utility system ensures consistent behavior, easy maintenance, and powerful data processing capabilities across the entire migration suite.