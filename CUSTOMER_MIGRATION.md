# Customer Migration Tool

This document describes the customer migration functionality that imports customer data from Magento to Shopify.

## Overview

The customer migration tool (`customer-migrate.js`) imports customer data from a Magento CSV export to Shopify using the GraphQL Admin API. It features:

- **Rate limiting** to respect Shopify API limits
- **Batch processing** for large datasets
- **Address parsing** and normalization
- **Phone number formatting** for international numbers
- **Customer tagging** based on customer attributes
- **Marketing consent** handling
- **Duplicate detection** and updates
- **Progress tracking** and detailed logging

## Setup

1. **CSV File**: Place your Magento customer export at `data/export_customers.csv` or set `CUSTOMERS_CSV_PATH` in your `.env` file.

2. **Environment Variables**: Add these to your `.env` file:
   ```env
   # Required
   SHOPIFY_STORE_URL=your-store.myshopify.com
   SHOPIFY_ACCESS_TOKEN=your-access-token
   
   # Optional - Customer Migration
   CUSTOMERS_CSV_PATH=./data/export_customers.csv
   START_ROW=0
   BATCH_SIZE=50
   MAX_CONCURRENT=2
   DELAY_MS=500
   ```

## CSV Format

The migration expects a Magento customer export with these fields:

| Field | Description | Required |
|-------|-------------|----------|
| `ID` | Original Magento customer ID | No |
| `Name` | Full customer name | No |
| `Email` | Customer email address | **Yes** |
| `Billing Firstname` | First name from billing | No |
| `Billing Lastname` | Last name from billing | No |
| `Phone` | Phone number | No |
| `Domicilio fiscale` | Billing address | No |
| `Indirizzo per la spedizione` | Shipping address | No |
| `ZIP` | Postal code | No |
| `Paese` | Country | No |
| `State/Province` | State/Province | No |
| `Città` | City | No |
| `Via` | Street | No |
| `Confirmed email` | Email confirmation status | No |
| `Date of Birth` | Customer birth date | No |
| `Tax VAT Number` | VAT number | No |
| `Gender` | Customer gender | No |
| `Azienda` | Company name | No |
| `Customer Since` | Registration date | No |
| `Gruppo` | Customer group | No |

## Features

### Address Processing

The migration intelligently parses combined address strings and maps them to separate Shopify address fields:

- **Street extraction** from combined address strings
- **City and postal code detection**
- **Country code normalization** (Italia → IT, Spagna → ES, etc.)
- **Duplicate address detection** (skips identical billing/shipping addresses)

### Phone Number Formatting

Phone numbers are automatically formatted with proper country codes:

- **Italian numbers**: `333123456` → `+393331234567`
- **International formats**: Handles various prefixes (`0039`, `00393`, etc.)
- **Invalid number filtering**: Skips empty or invalid numbers

### Customer Tagging

Customers are automatically tagged based on their attributes:

- **Country tags**: `Country: Spain` for non-Italian customers
- **Business customers**: `Business Customer` for customers with company info
- **Registration year**: `Registered: 2015` based on signup date
- **Customer groups**: Based on Magento customer group
- **Gender tags**: `Gender: Male/Female` when available

### Marketing Consent

Email marketing consent is set based on email confirmation status:
- **Confirmed emails** → `SUBSCRIBED` with `CONFIRMED_OPT_IN`
- **Unconfirmed emails** → No marketing consent set

### Customer Notes

Additional information is stored in customer notes:
- Original Magento ID
- Date of birth
- VAT number
- Company information

## Usage

### Run Customer Migration

```bash
# Using npm script
npm run migrate-customers

# Using Docker Compose
docker compose run --rm migration npm run migrate-customers

# Direct node execution
node customer-migrate.js
```

### Migration Process

1. **CSV Loading**: Parses the customer CSV file
2. **Batch Selection**: Processes customers in configurable batches
3. **Data Normalization**: Cleans and formats customer data
4. **Duplicate Check**: Searches for existing customers by email
5. **Create/Update**: Creates new customers or updates existing ones
6. **Progress Tracking**: Logs progress every 10 customers
7. **Final Statistics**: Reports success/failure counts

### Batch Processing

Process customers in batches to handle large datasets:

```bash
# Process first 50 customers
START_ROW=0 BATCH_SIZE=50 npm run migrate-customers

# Process next 50 customers
START_ROW=50 BATCH_SIZE=50 npm run migrate-customers

# Process customers 100-199
START_ROW=100 BATCH_SIZE=100 npm run migrate-customers
```

## Data Validation

The migration includes validation for:

- **Required email addresses** (skips customers without valid emails)
- **Email format validation** (skips malformed emails)
- **Phone number validation** (cleans and formats phone numbers)
- **Address completeness** (only creates addresses with sufficient data)

### Skipped Customers

Customers are skipped (not migrated) if:
- Missing email address
- Invalid email format (no `@` symbol)
- Email contains `nomail` (test emails)
- Email is clearly invalid (`nessrls.it` domain)

## Error Handling

- **Individual failures** don't stop the batch processing
- **Rate limiting** automatically handles Shopify API limits
- **Detailed logging** for troubleshooting
- **Graceful retries** for transient network issues

## Output Example

```
=== Starting Magento to Shopify Customer Migration ===
Config: Start Row=0, Batch Size=50
Loading customer CSV file...
CSV parsed successfully: 171 rows found
Selected batch: rows 0 to 50 (50 items)
Migrating rows 0 to 50 (50 customers)

Processing customer: marco.camborata@nessrls.it
Creating new customer: marco.camborata@nessrls.it
✓ Created customer: Test Test (ID: gid://shopify/Customer/...)

Processing customer: info@motormare.it
Updating existing customer: info@motormare.it
↻ Updated customer: sabrina rizzo (ID: gid://shopify/Customer/...)

Progress: 10/50 processed | Lap: 15.2s (1520ms/customer) | Total: 15.2s
Progress: 20/50 processed | Lap: 12.8s (1280ms/customer) | Total: 28.0s

=== Customer Migration Complete ===
Total: 50, Created: 35, Updated: 10, Skipped: 3, Failed: 2
Elapsed time: 1m 45s (105000ms)
```

## Integration with Product Migration

Both migrations share the same utility classes:

- **ShopifyClient**: Handles all GraphQL API communication
- **CSVParser**: Parses CSV files with validation
- **RateLimiter**: Manages API rate limiting
- **Logger**: Provides structured logging
- **TimeTracker**: Tracks execution time and performance

This ensures consistent behavior and avoids code duplication between the two migration tools.