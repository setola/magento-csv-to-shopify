# Paganini Availability Sync

Automated inventory synchronization from Paganini CSV to Shopify, designed for scheduled cron jobs.

## Overview

This feature provides a lightweight, fast alternative to the full Paganini product import. It:

- **Only updates inventory quantities** (no product details, prices, or descriptions)
- **Much faster** than full migration (~3x faster with optimized concurrency)
- **Designed for automation** - suitable for cron jobs
- **Includes CSV download** - can fetch latest data automatically
- **Filters LEUPOLD products** - same vendor filtering as full import

## Quick Start

### Manual Sync

```bash
# Sync with existing CSV
go-task sync:paganini-availability

# Sync with specific CSV file
go-task sync:paganini-availability PAGANINI_CSV_PATH=./data/paganini_data_latest.csv

# Process larger batches for speed
go-task sync:paganini-availability BATCH_SIZE=200
```

### Automated Sync with Download

```bash
# Download latest CSV and sync (one command)
go-task cron:paganini-availability
```

## Cron Job Setup

### Add to Crontab

```bash
# Edit crontab
crontab -e

# Add sync job (every 6 hours)
0 */6 * * * cd /home/setola/repos/planetshooters/shopify_importer && go-task cron:paganini-availability >> logs/cron.log 2>&1

# Or every 4 hours
0 */4 * * * cd /home/setola/repos/planetshooters/shopify_importer && go-task cron:paganini-availability >> logs/cron.log 2>&1

# Or twice daily (8 AM and 8 PM)
0 8,20 * * * cd /home/setola/repos/planetshooters/shopify_importer && go-task cron:paganini-availability >> logs/cron.log 2>&1
```

### Verify Cron Setup

```bash
# List cron jobs
crontab -l

# Check cron logs
tail -f logs/cron.log

# Check sync logs
tail -f logs/migration-*.log
```

## Configuration

### Environment Variables

Configure in `.env` file:

```env
# Shopify Configuration
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxx
SHOPIFY_LOCATION_ID=gid://shopify/Location/xxx

# Paganini CSV Path
PAGANINI_CSV_PATH=./data/paganini_data_*.csv

# Performance Tuning (optimized for availability sync)
START_ROW=0
BATCH_SIZE=100
MAX_CONCURRENT=3
DELAY_MS=300

# Web Download (for cron job)
LOGIN_URL=https://example.com/login
DOWNLOAD_URL=https://example.com/export/csv
WEB_USERNAME=your_username
WEB_PASSWORD=your_password
OUTPUT_DIR=./data
DOWNLOAD_FILENAME=paganini_data
```

### Performance Tuning

The availability sync has different defaults than full migration:

| Setting | Full Migration | Availability Sync | Reason |
|---------|---------------|-------------------|---------|
| `BATCH_SIZE` | 50 | 100 | Faster operation allows larger batches |
| `MAX_CONCURRENT` | 2 | 3 | Only inventory updates, less complex |
| `DELAY_MS` | 500 | 300 | Reduced delay for speed |

## How It Works

### Workflow

1. **Download CSV** (if using `cron:paganini-availability`)
   - Authenticates with web source
   - Downloads latest Paganini CSV
   - Saves with timestamp

2. **Parse CSV**
   - Reads semicolon-separated values
   - Filters LEUPOLD products
   - Extracts SKU and availability

3. **Update Inventory**
   - Finds product by SKU
   - Maps availability (A=1, B=4, C=10, other=0)
   - Updates Shopify inventory

### What Gets Updated

- ✅ **Inventory quantity** - Based on `Disponibilita` column
- ❌ **Product title** - Not updated
- ❌ **Description** - Not updated
- ❌ **Price** - Not updated
- ❌ **Cost** - Not updated
- ❌ **Tags** - Not updated

### What Gets Skipped

- Products with vendor != "LEUPOLD"
- Products not found in Shopify (logs warning)
- Rows without valid `Codice_Produttore`

## Comparison

### vs Full Migration

| Feature | Full Migration | Availability Sync |
|---------|---------------|-------------------|
| **Speed** | Slower | ~3x faster |
| **Updates** | Everything | Inventory only |
| **Use Case** | Initial import, major changes | Daily/frequent updates |
| **Complexity** | High (variants, prices, etc.) | Low (inventory only) |
| **Rate Limits** | More aggressive | Lighter |

### When to Use Each

**Use Full Migration when:**
- First time importing products
- Prices have changed
- Product descriptions need updating
- Major catalog changes

**Use Availability Sync when:**
- Only stock levels have changed
- Running scheduled automation
- Need fast updates
- Minimal changes to catalog

## Monitoring

### Check Sync Status

```bash
# View latest log
tail -f logs/migration-*.log

# Search for specific SKU
grep "LEU.110295" logs/migration-*.log

# Count updates
grep "Updated availability" logs/migration-*.log | wc -l

# Find errors
grep ERROR logs/migration-*.log
```

### Statistics

Each sync provides:
- Total processed
- Successfully updated
- Not found (products not in Shopify)
- Skipped (non-LEUPOLD)
- Errors
- Elapsed time

Example output:
```
=== Availability Sync Complete ===
Total processed: 150
Updated: 142
Not found: 5
Skipped: 3
Errors: 0
Elapsed time: 1m 23s (83451ms)
```

## Troubleshooting

### Products Not Found

If many products show "not found":
- Check if they were imported with full migration first
- Verify SKU format matches (LEU.xxxxx)
- Check LEUPOLD vendor filter

### Rate Limiting

If you hit rate limits:
```bash
# Reduce concurrency
go-task sync:paganini-availability MAX_CONCURRENT=2

# Increase delay
go-task sync:paganini-availability DELAY_MS=500

# Smaller batches
go-task sync:paganini-availability BATCH_SIZE=50
```

### CSV Download Fails

Check web download configuration:
```bash
# Test download separately
go-task downloader:download-csv

# Verify credentials in .env
echo $WEB_USERNAME
echo $LOGIN_URL
```

## Best Practices

### Scheduling

- **Don't run too frequently** - Every 4-6 hours is usually sufficient
- **Avoid peak hours** - Schedule during low-traffic periods
- **Monitor first runs** - Check logs until stable

### Maintenance

- **Rotate logs** - Old logs accumulate quickly
- **Monitor cron output** - Check `logs/cron.log` regularly
- **Test before automation** - Run manually first

### Error Handling

The script:
- Continues on individual errors (doesn't stop)
- Logs all errors with SKU
- Returns proper exit codes
- Safe for cron (won't leave hanging processes)

## Example Scenarios

### Scenario 1: Initial Setup

```bash
# 1. Run full migration first
go-task migration:paganini

# 2. Set up cron for daily updates
crontab -e
# Add: 0 2 * * * cd /path/to/shopify_importer && go-task cron:paganini-availability
```

### Scenario 2: Manual Update After Stock Delivery

```bash
# 1. Get latest CSV (if not auto-downloaded)
go-task downloader:download-csv

# 2. Sync immediately
go-task sync:paganini-availability

# 3. Verify updates
grep "Updated availability" logs/migration-*.log | tail -20
```

### Scenario 3: Emergency Out-of-Stock

```bash
# Quick sync with aggressive settings
go-task sync:paganini-availability BATCH_SIZE=200 MAX_CONCURRENT=4 DELAY_MS=200
```

## Files Created

- **`paganini-availability-sync.js`** - Main sync script
- **`logs/migration-*.log`** - Sync logs (timestamped)
- **`logs/cron.log`** - Cron job output

## Integration

The availability sync integrates seamlessly with:
- **Web Downloader** - Automatic CSV fetching
- **Logger** - Unified logging
- **RateLimiter** - Shopify API management
- **PaganiniNormalizer** - SKU and availability mapping

## Summary

The Paganini Availability Sync provides a fast, reliable way to keep inventory synchronized with minimal overhead. It's designed for automation and integrates perfectly with cron jobs for hands-off operation.
