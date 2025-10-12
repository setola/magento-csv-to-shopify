# ColumnContentExtractor Enhanced Functionality

The `ColumnContentExtractor.js` utility has been expanded to support three different types of row extraction from CSV files:

## 1. Content-based Extraction (Original Functionality)
Extract rows where a column has any non-empty content.

```bash
# Extract products that have descriptions
go-task csv:extract-by-column COLUMN=description

# Count products with categories
go-task csv:extract-by-column COLUMN=categories COUNT_ONLY=true

# Export products with short descriptions to file
go-task csv:extract-by-column COLUMN=short_description OUTPUT=products_with_short_desc.csv
```

## 2. Exact Value Matching (New Functionality)
Extract rows where a column equals a specific value exactly.

```bash
# Extract all enabled products
go-task csv:extract-by-value COLUMN=status VALUE=Enabled

# Find all simple products
go-task csv:extract-by-value COLUMN=product_type VALUE=simple OUTPUT=simple_products.csv

# Count disabled products
go-task csv:extract-by-value COLUMN=status VALUE=Disabled COUNT_ONLY=true

# Case-insensitive matching for manufacturer
go-task csv:extract-by-value COLUMN=manufacturer VALUE=apple CASE_INSENSITIVE=true
```

## 3. Substring Matching (New Functionality)
Extract rows where a column contains a specific substring.

```bash
# Find all products with "iPhone" in the name
go-task csv:extract-by-contains COLUMN=name SUBSTRING=iPhone

# Find products in Electronics categories
go-task csv:extract-by-contains COLUMN=categories SUBSTRING=Electronics

# Case-insensitive search for wireless products
go-task csv:extract-by-contains COLUMN=description SUBSTRING=wireless CASE_INSENSITIVE=true

# Export all products containing "Pro" in name
go-task csv:extract-by-contains COLUMN=name SUBSTRING=Pro OUTPUT=pro_products.csv
```

## Direct Command Line Usage

You can also use the utility directly with Docker:

```bash
# Extract by exact value
docker compose run --rm migration node utils/ColumnContentExtractor.js status ./products.csv --value "Enabled"

# Extract by substring
docker compose run --rm migration node utils/ColumnContentExtractor.js name ./products.csv --contains "iPhone" --case-insensitive

# Original content-based extraction
docker compose run --rm migration node utils/ColumnContentExtractor.js description ./products.csv

# List available columns
docker compose run --rm migration node utils/ColumnContentExtractor.js dummy ./products.csv --list-columns
```

## Programmatic Usage

For use in other Node.js scripts:

```javascript
import { 
    extractRowsByValue, 
    extractRowsByContains, 
    extractRowsWithContent 
} from './utils/ColumnContentExtractor.js';

// Extract rows where status equals "Enabled"
const enabledProducts = await extractRowsByValue(
    './products.csv', 
    'status', 
    'Enabled'
);

// Extract rows where name contains "iPhone" (case-insensitive)
const iPhoneProducts = await extractRowsByContains(
    './products.csv', 
    'name', 
    'iPhone', 
    ',', 
    true // case-insensitive
);

// Original functionality - rows with content in description
const productsWithDesc = await extractRowsWithContent(
    './products.csv', 
    'description'
);
```

## Available Options

All extraction methods support these options:

- `--output, -o`: Write results to a file instead of stdout
- `--count-only`: Only show count of matching rows
- `--no-header`: Do not include header row in output
- `--case-insensitive, -i`: Make value/contains matching case-insensitive
- `--delimiter, -d`: CSV delimiter (default: comma)
- `--list-columns, -l`: List available columns and exit
- `--help, -h`: Show help message

## Use Cases for Migration Project

### Find Products by Status
```bash
# Extract only enabled products for migration
go-task csv:extract-by-value COLUMN=status VALUE=Enabled OUTPUT=enabled_products.csv

# Count products that need status updates
go-task csv:extract-by-value COLUMN=status VALUE=Disabled COUNT_ONLY=true
```

### Filter by Product Type
```bash
# Extract only simple products
go-task csv:extract-by-value COLUMN=product_type VALUE=simple OUTPUT=simple_products.csv

# Find configurable products that need special handling
go-task csv:extract-by-value COLUMN=product_type VALUE=configurable
```

### Search Product Names
```bash
# Find all Apple products
go-task csv:extract-by-contains COLUMN=name SUBSTRING=Apple CASE_INSENSITIVE=true

# Extract products by brand or model
go-task csv:extract-by-contains COLUMN=name SUBSTRING=iPhone OUTPUT=iphone_products.csv
```

### Category-based Filtering
```bash
# Extract products from specific categories
go-task csv:extract-by-contains COLUMN=categories SUBSTRING="Electronics/Phones"

# Find products in furniture category
go-task csv:extract-by-contains COLUMN=categories SUBSTRING=Furniture
```

This enhanced functionality makes the `ColumnContentExtractor` much more versatile for data analysis and migration preparation tasks.