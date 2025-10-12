/**
 * Product Deletion Script for Shopify
 * Deletes products from Shopify store based on SKUs listed in a CSV file
 * 
 * Uses existing utilities following DRY principles:
 * - CSVParser: For reading and parsing CSV files
 * - ShopifyClient: For Shopify GraphQL API operations
 * - Logger: For structured logging
 * - RateLimiter: For managing concurrent requests
 * - TimeTracker: For performance monitoring
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Import utilities (following DRY principle - reuse existing code)
import CSVParser from './utils/CSVParser.js';
import ShopifyClient from './utils/ShopifyClient.js';
import Logger from './utils/Logger.js';
import RateLimiter from './utils/RateLimiter.js';
import TimeTracker from './utils/TimeTracker.js';

class ProductDeleter {
  constructor() {
    // Initialize logger
    this.logger = new Logger();
    this.log = this.logger.log.bind(this.logger);

    // Configuration from environment variables
    this.config = {
      shopifyStore: process.env.SHOPIFY_STORE_URL,
      shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
      csvPath: process.env.DELETE_CSV_PATH || './data/products_test.csv',
      startRow: parseInt(process.env.START_ROW || '0'),
      batchSize: parseInt(process.env.BATCH_SIZE || '50'),
      maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '2'),
      delayBetweenRequests: parseInt(process.env.DELAY_MS || '1000')
    };

    // Initialize utilities (reusing existing components)
    this.csvParser = new CSVParser(this.log);
    this.shopifyClient = new ShopifyClient(this.config, this.log);
    this.rateLimiter = new RateLimiter(this.config, this.log);
    this.timeTracker = new TimeTracker();

    // Statistics
    this.stats = {
      totalProducts: 0,
      processed: 0,
      deleted: 0,
      notFound: 0,
      errors: 0
    };
  }

  // Validate configuration
  validateConfig() {
    const required = ['shopifyStore', 'shopifyAccessToken'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (!this.config.csvPath) {
      throw new Error('CSV_PATH or DELETE_CSV_PATH environment variable is required');
    }
  }

  // Delete a single product by SKU
  async deleteProductBySku(sku) {
    try {
      this.log(`Searching for product with SKU: ${sku}`, 'INFO');
      
      // Find product by SKU (reusing existing method)
      const product = await this.shopifyClient.findProductBySku(sku);
      
      if (!product) {
        this.log(`Product not found with SKU: ${sku}`, 'WARN');
        this.stats.notFound++;
        return { success: false, reason: 'not_found', sku };
      }

      this.log(`Found product "${product.title}" (ID: ${product.id}) for SKU: ${sku}`, 'INFO');
      
      // Delete the product (using new method)
      const deletedProductId = await this.shopifyClient.deleteProductById(product.id);
      
      this.log(`✓ Deleted product "${product.title}" (SKU: ${sku}, ID: ${deletedProductId})`, 'SUCCESS');
      this.stats.deleted++;
      return { success: true, sku, productId: deletedProductId, title: product.title };

    } catch (error) {
      this.log(`✗ Failed to delete product with SKU: ${sku} - ${error.message}`, 'ERROR');
      this.stats.errors++;
      return { success: false, reason: 'error', sku, error: error.message };
    }
  }

  // Process a batch of products
  async processBatch(products) {
    // Create tasks for rate limiter
    const tasks = products.map((product, index) => 
      () => this.deleteProductBySku(product.sku)
    );
    
    // Execute with rate limiting and progress tracking
    const results = await this.rateLimiter.executeTasks(tasks, (completed, total, error) => {
      // Progress reporting every 10 items
      if (completed % 10 === 0 || completed === total) {
        const elapsed = this.timeTracker.getElapsedTime();
        const rate = completed / elapsed * 1000;
        this.log(`Progress: ${completed}/${total} | ` +
                 `Deleted: ${this.stats.deleted} | Not Found: ${this.stats.notFound} | ` +
                 `Errors: ${this.stats.errors} | Rate: ${rate.toFixed(1)} items/sec`, 'INFO');
      }
    });
    
    // Update processed count to match completed tasks
    this.stats.processed = results.results.length;
    
    return results.results.map(r => r.result || { success: false, reason: 'batch_error' });
  }

  // Main deletion process
  async run() {
    try {
      this.log('Starting Product Deletion Process', 'INFO');
      this.log(`Configuration: CSV: ${this.config.csvPath}, Start Row: ${this.config.startRow}, Batch Size: ${this.config.batchSize}`, 'INFO');
      
      // Validate configuration
      this.validateConfig();
      
      // Time tracking starts automatically in constructor
      
      // Parse CSV file (reusing existing parser)
      this.log('Reading and parsing CSV file...', 'INFO');
      const allData = await this.csvParser.parseCSV(this.config.csvPath);
      
      if (!allData || allData.length === 0) {
        throw new Error('No data found in CSV file');
      }
      
      // Validate required fields
      const validation = this.csvParser.validateRequiredFields(allData, ['sku'], 'product');
      if (!validation.valid) {
        this.log(`Found ${validation.invalidItems.length} products with missing SKUs`, 'WARN');
      }
      
      // Use valid items only
      const validData = validation.validItems;
      
      // Get batch of products to process
      const batchInfo = this.csvParser.getBatch(validData, this.config.startRow, this.config.batchSize);
      this.stats.totalProducts = batchInfo.batch.length;
      
      if (this.stats.totalProducts === 0) {
        this.log('No products to delete in the specified range', 'WARN');
        return;
      }
      
      this.log(`Will delete ${this.stats.totalProducts} products (from row ${batchInfo.startRow} to ${batchInfo.endRow})`, 'INFO');
      
      // Confirm deletion (in production, you might want to add a confirmation prompt)
      this.log('⚠️  WARNING: This will permanently delete products from your Shopify store!', 'WARN');
      this.log('Starting deletion in 3 seconds...', 'WARN');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Process the batch
      await this.processBatch(batchInfo.batch);
      
      // Final statistics
      const totalTime = this.timeTracker.getElapsedTime();
      const avgRate = this.stats.processed / totalTime * 1000;
      
      this.log('='.repeat(60), 'INFO');
      this.log('DELETION SUMMARY:', 'INFO');
      this.log(`Total Products Processed: ${this.stats.processed}`, 'INFO');
      this.log(`Successfully Deleted: ${this.stats.deleted}`, 'SUCCESS');
      this.log(`Not Found (skipped): ${this.stats.notFound}`, 'WARN');
      this.log(`Errors: ${this.stats.errors}`, this.stats.errors > 0 ? 'ERROR' : 'INFO');
      this.log(`Total Time: ${(totalTime / 1000).toFixed(1)} seconds`, 'INFO');
      this.log(`Average Rate: ${avgRate.toFixed(1)} items/second`, 'INFO');
      this.log('='.repeat(60), 'INFO');
      
      if (this.stats.errors > 0) {
        this.log('Some deletions failed. Check the logs above for details.', 'WARN');
      }
      
      if (batchInfo.hasMore) {
        const nextStartRow = batchInfo.endRow;
        this.log(`There are more products to process. To continue, set START_ROW=${nextStartRow}`, 'INFO');
      }
      
    } catch (error) {
      this.log(`Deletion process failed: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

// Run the deletion if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const deleter = new ProductDeleter();
  
  deleter.run()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Deletion failed:', error.message);
      process.exit(1);
    });
}

export default ProductDeleter;