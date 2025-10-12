// customer-migrate.js
import fs from 'fs';
import dotenv from 'dotenv';

// Import utilities
import Logger from './utils/Logger.js';
import TimeTracker from './utils/TimeTracker.js';
import ShopifyClient from './utils/ShopifyClient.js';
import CSVParser from './utils/CSVParser.js';
import RateLimiter from './utils/RateLimiter.js';
import CustomerValidators from './utils/CustomerValidators.js';
import CustomerNormalizers from './utils/CustomerNormalizers.js';

dotenv.config();

// Initialize logger
const logger = new Logger();

// Configuration
const CONFIG = {
  shopifyStore: process.env.SHOPIFY_STORE_URL,
  shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  csvPath: process.env.CUSTOMERS_CSV_PATH || './data/export_customers.csv',
  startRow: parseInt(process.env.START_ROW || '0'),
  batchSize: parseInt(process.env.BATCH_SIZE || '50'), // Smaller batch for customers
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '2'),
  delayBetweenRequests: parseInt(process.env.DELAY_MS || '500')
};

// Initialize utilities
const shopifyClient = new ShopifyClient(CONFIG, logger.log.bind(logger));
const csvParser = new CSVParser(logger.log.bind(logger));
const rateLimiter = new RateLimiter(CONFIG, logger.log.bind(logger));
const customerValidators = new CustomerValidators(logger.log.bind(logger));

// Process a single customer

async function processCustomer(customerData, index) {
  try {
    // Validate customer data using utility
    const validation = customerValidators.validateRequiredFields(customerData);
    if (!validation.valid) {
      logger.log(`Skipping customer at row ${index}: ${validation.reason}${validation.email ? ` (${validation.email})` : ''}`, 'WARN');
      return { skipped: true, reason: validation.reason };
    }

    const email = validation.email;
    logger.log(`Processing customer: ${email}`, 'DEBUG');
    
    // Check if customer already exists
    const existingCustomer = await shopifyClient.findCustomerByEmail(email);
    
    // Normalize customer data using utility
    const normalizer = new CustomerNormalizers(CONFIG, logger.log.bind(logger), customerData);
    const normalizedCustomer = normalizer.normalizeCustomerData();
    
    if (existingCustomer) {
      // Update existing customer
      logger.log(`Updating existing customer: ${email}`, 'INFO');
      const updatedCustomer = await shopifyClient.updateCustomer(existingCustomer.id, normalizedCustomer);
      return { updated: true, customer: updatedCustomer };
    } else {
      // Create new customer
      logger.log(`Creating new customer: ${email}`, 'INFO');
      const newCustomer = await shopifyClient.createCustomer(normalizedCustomer);
      return { created: true, customer: newCustomer };
    }
  } catch (error) {
    logger.log(`Failed processing customer at row ${index}: ${error.message}`, 'ERROR');
    return { error: true, message: error.message };
  }
}

// Main migration function
async function migrateCustomers() {
  const timer = new TimeTracker();
  logger.log('=== Starting Magento to Shopify Customer Migration ===');
  logger.log(`Config: Start Row=${CONFIG.startRow}, Batch Size=${CONFIG.batchSize}`);

  try {
    // Parse CSV
    logger.log('Loading customer CSV file...');
    const allCustomers = await csvParser.parseCSV(CONFIG.csvPath);
    logger.log(`Total customers in CSV: ${allCustomers.length}`);

    // Get batch
    const batchInfo = csvParser.getBatch(allCustomers, CONFIG.startRow, CONFIG.batchSize);
    const customersToMigrate = batchInfo.batch;
    
    logger.log(`Migrating rows ${batchInfo.startRow} to ${batchInfo.endRow} (${customersToMigrate.length} customers)`);

    // Initialize stats
    const stats = {
      total: customersToMigrate.length,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0
    };

    // Process customers with rate limiting
    const tasks = customersToMigrate.map((customer, idx) => 
      () => processCustomer(customer, CONFIG.startRow + idx)
    );

    // Execute with progress tracking
    const results = await rateLimiter.executeTasks(tasks, (completed, total, error) => {
      if (completed % 10 === 0 || completed === total) {
        const timingStats = timer.getTimingStats(10);
        logger.log(`Progress: ${completed}/${total} processed | Lap: ${timingStats.lapTimeFormatted} (${timingStats.avgTimePerItem}ms/customer) | Total: ${timingStats.totalElapsedFormatted}`);
        timer.updateLapTimer();
      }
    });

    // Process results and update stats
    results.results.forEach(result => {
      if (result.success && result.result) {
        const res = result.result;
        if (res.created) stats.created++;
        else if (res.updated) stats.updated++;
        else if (res.skipped) stats.skipped++;
      } else {
        stats.failed++;
      }
    });

    // Final stats
    const finalElapsedTime = timer.getElapsedTime();
    const finalElapsedFormatted = timer.getFormattedElapsedTime();
    
    logger.log('=== Customer Migration Complete ===');
    logger.log(`Total: ${stats.total}, Created: ${stats.created}, Updated: ${stats.updated}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`);
    logger.log(`Elapsed time: ${finalElapsedFormatted} (${finalElapsedTime}ms)`);
    
    if (stats.failed > 0) {
      logger.log('⚠ Some customers failed to migrate. Check the log for details.', 'WARN');
      process.exit(1);
    }

  } catch (error) {
    logger.log(`Fatal error: ${error.message}`, 'ERROR');
    process.exit(1);
  }
}

// Validation
function validateConfig() {
  if (!CONFIG.shopifyStore || !CONFIG.shopifyAccessToken) {
    console.error('ERROR: Missing Shopify credentials. Check your .env file.');
    process.exit(1);
  }

  if (!fs.existsSync(CONFIG.csvPath)) {
    console.error(`ERROR: Customer CSV file not found: ${CONFIG.csvPath}`);
    process.exit(1);
  }
}

// Run
validateConfig();
migrateCustomers();