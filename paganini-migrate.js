// paganini-migrate.js
import fs from 'fs';
import dotenv from 'dotenv';
import Papa from 'papaparse';

// Import utilities
import PaganiniNormalizer from './utils/PaganiniNormalizer.js';
import TimeTracker from './utils/TimeTracker.js';
import Logger from './utils/Logger.js';
import ShopifyClient from './utils/ShopifyClient.js';
import RateLimiter from './utils/RateLimiter.js';

dotenv.config();

// Initialize logger
const logger = new Logger();

// Configuration
const CONFIG = {
  shopifyStore: process.env.SHOPIFY_STORE_URL,
  shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  shopifyLocationId: process.env.SHOPIFY_LOCATION_ID,
  paganiniCsvPath: process.env.PAGANINI_CSV_PATH || './data/paganini_test.csv',
  startRow: parseInt(process.env.START_ROW || '0'),
  batchSize: parseInt(process.env.BATCH_SIZE || '50'),
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '2'),
  delayBetweenRequests: parseInt(process.env.DELAY_MS || '500')
};

// Logger wrapper function
function log(message, type = 'INFO') {
  logger.log(message, type);
}

// Initialize utilities
const shopifyClient = new ShopifyClient(CONFIG, log);
const rateLimiter = new RateLimiter(CONFIG, log);

/**
 * Parse Paganini CSV file (semicolon-separated)
 * @param {string} csvPath - Path to CSV file
 * @returns {Promise<Array>} Parsed CSV data
 */
async function parsePaganiniCSV(csvPath) {
  return new Promise((resolve, reject) => {
    fs.readFile(csvPath, 'utf8', (err, data) => {
      if (err) {
        log(`Error reading CSV file: ${err.message}`, 'ERROR');
        reject(err);
        return;
      }

      Papa.parse(data, {
        header: true,
        skipEmptyLines: true,
        delimiter: ';', // Paganini CSV uses semicolon separator
        complete: (results) => {
          log(`CSV parsed successfully: ${results.data.length} rows found`, 'INFO');
          resolve(results.data);
        },
        error: (error) => {
          log(`Error parsing CSV: ${error.message}`, 'ERROR');
          reject(error);
        }
      });
    });
  });
}

/**
 * Create product on Shopify
 * @param {Object} productData - Normalized product data
 * @returns {Promise<Object>} Created product
 */
async function createShopifyProduct(productData) {
  const mutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          handle
          variants(first: 1) {
            edges {
              node {
                id
                sku
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const input = {
    title: productData.title,
    descriptionHtml: productData.description || '',
    vendor: productData.vendor,
    status: productData.status,
    tags: ['paganini']
  };

  try {
    const result = await shopifyClient.query(mutation, { input });

    if (result.productCreate?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(result.productCreate.userErrors));
    }

    const product = result.productCreate.product;
    const variantId = product.variants.edges[0].node.id;
    
    log(`✓ Created product: ${productData.title} (SKU: ${productData.sku})`, 'SUCCESS');

    // Update the default variant with SKU and price
    await updateVariantDetails(product.id, variantId, productData);
    
    // Update inventory cost
    await updateInventoryCost(variantId, productData.cost || productData.price);

    // Update inventory quantity
    await updateInventoryQuantity(variantId, productData.quantity);

    return product;
  } catch (error) {
    log(`✗ Failed to create product ${productData.sku}: ${error.message}`, 'ERROR');
    throw error;
  }
}

/**
 * Update variant details (SKU and price)
 * @param {string} productId - Shopify product ID
 * @param {string} variantId - Shopify variant ID (not used, but kept for compatibility)
 * @param {Object} productData - Normalized product data
 */
async function updateVariantDetails(productId, variantId, productData) {
  const mutation = `
    mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $strategy: ProductVariantsBulkCreateStrategy) {
      productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
        productVariants {
          id
          sku
          price
          inventoryItem {
            id
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variants = [{
    price: productData.price,
    inventoryItem: {
      sku: productData.sku,
      cost: productData.cost || productData.price,
      tracked: true
    }
  }];

  try {
    const result = await shopifyClient.query(mutation, { 
      productId, 
      variants,
      strategy: 'REMOVE_STANDALONE_VARIANT'
    });

    if (result.productVariantsBulkCreate?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(result.productVariantsBulkCreate.userErrors));
    }

    log(`  ↳ Variant updated with SKU: ${productData.sku}, Price: ${productData.price}`, 'DEBUG');
  } catch (error) {
    log(`Warning: Failed to update variant details: ${error.message}`, 'WARN');
    throw error;
  }
}

/**
 * Update existing product on Shopify
 * @param {string} productId - Shopify product ID
 * @param {string} variantId - Shopify variant ID
 * @param {Object} productData - Normalized product data
 * @returns {Promise<Object>} Updated product
 */
async function updateShopifyProduct(productId, variantId, productData) {
  const productMutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    // Update product details
    const productInput = {
      id: productId,
      title: productData.title,
      descriptionHtml: productData.description || '',
      vendor: productData.vendor,
      status: productData.status,
      tags: ['paganini']
    };

    const productResult = await shopifyClient.query(productMutation, { input: productInput });

    if (productResult.productUpdate?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(productResult.productUpdate.userErrors));
    }

    // Update variant with new SKU and price using bulk create (replaces existing variant)
    await updateVariantDetails(productId, variantId, productData);

    log(`↻ Updated product: ${productData.title} (SKU: ${productData.sku})`, 'SUCCESS');

    // Update inventory quantity
    const newVariantId = variantId; // Get new variant ID if needed
    await updateInventoryQuantity(newVariantId, productData.quantity);

    return productResult.productUpdate.product;
  } catch (error) {
    log(`✗ Failed to update product ${productData.sku}: ${error.message}`, 'ERROR');
    throw error;
  }
}

/**
 * Update inventory cost for a variant
 * @param {string} variantId - Shopify variant ID
 * @param {string} cost - Cost value
 */
async function updateInventoryCost(variantId, cost) {
  // First, get inventory item ID from variant
  const query = `
    query getInventoryItem($id: ID!) {
      productVariant(id: $id) {
        inventoryItem {
          id
        }
      }
    }
  `;

  try {
    const result = await shopifyClient.query(query, { id: variantId });
    const inventoryItemId = result.productVariant?.inventoryItem?.id;

    if (!inventoryItemId) {
      log(`Warning: Could not find inventory item for variant ${variantId}`, 'WARN');
      return;
    }

    // Update cost
    const mutation = `
      mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) {
          inventoryItem {
            id
            unitCost {
              amount
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const input = {
      cost: cost
    };

    const costResult = await shopifyClient.query(mutation, { id: inventoryItemId, input });

    if (costResult.inventoryItemUpdate?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(costResult.inventoryItemUpdate.userErrors));
    }

    log(`  ↳ Cost set to ${cost}`, 'DEBUG');
  } catch (error) {
    log(`Warning: Failed to update cost: ${error.message}`, 'WARN');
  }
}

/**
 * Update inventory quantity for a variant
 * @param {string} variantId - Shopify variant ID
 * @param {number} quantity - Inventory quantity
 */
async function updateInventoryQuantity(variantId, quantity) {
  // First, get inventory item ID from variant
  const query = `
    query getInventoryItem($id: ID!) {
      productVariant(id: $id) {
        inventoryItem {
          id
        }
      }
    }
  `;

  try {
    const result = await shopifyClient.query(query, { id: variantId });
    const inventoryItemId = result.productVariant?.inventoryItem?.id;

    if (!inventoryItemId) {
      log(`Warning: Could not find inventory item for variant ${variantId}`, 'WARN');
      return;
    }

    // Update inventory quantity
    const mutation = `
      mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
        inventorySetOnHandQuantities(input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    const input = {
      reason: "correction",
      setQuantities: [
        {
          inventoryItemId: inventoryItemId,
          locationId: CONFIG.shopifyLocationId,
          quantity: quantity
        }
      ]
    };

    const inventoryResult = await shopifyClient.query(mutation, { input });

    if (inventoryResult.inventorySetOnHandQuantities?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(inventoryResult.inventorySetOnHandQuantities.userErrors));
    }

    log(`  ↳ Inventory set to ${quantity} units`, 'DEBUG');
  } catch (error) {
    log(`Warning: Failed to update inventory: ${error.message}`, 'WARN');
  }
}

/**
 * Process a single product
 * @param {Object} rowData - Raw CSV row data
 * @param {number} index - Row index
 */
async function processProduct(rowData, index) {
  try {
    // Create normalizer instance
    const normalizer = new PaganiniNormalizer(CONFIG, log, rowData);

    // Check if product should be imported (LEUPOLD only)
    if (!normalizer.shouldImport()) {
      log(`↷ Skipping row ${index + 1}: Not a LEUPOLD product (${rowData.Produttore})`, 'DEBUG');
      return { skipped: true };
    }

    // Build normalized product data
    let productData;
    try {
      productData = normalizer.buildProductData();
    } catch (error) {
      log(`✗ Row ${index + 1}: Failed to normalize data - ${error.message}`, 'ERROR');
      return { error: error.message };
    }

    log(`Processing product ${index + 1}: ${productData.title} (SKU: ${productData.sku})`, 'INFO');

    // Check if product already exists
    const existingProduct = await shopifyClient.findProductBySku(productData.sku);

    if (existingProduct) {
      const variantId = existingProduct.variants.edges[0].node.id;
      await updateShopifyProduct(existingProduct.id, variantId, productData);
      return { updated: true, sku: productData.sku };
    } else {
      await createShopifyProduct(productData);
      return { created: true, sku: productData.sku };
    }
  } catch (error) {
    log(`✗ Row ${index + 1}: ${error.message}`, 'ERROR');
    return { error: error.message };
  }
}

/**
 * Main migration function
 */
async function main() {
  const timer = new TimeTracker();
  
  try {
    log('=== Starting Paganini CSV Import to Shopify ===', 'INFO');
    log(`Configuration:`, 'INFO');
    log(`  CSV Path: ${CONFIG.paganiniCsvPath}`, 'INFO');
    log(`  Start Row: ${CONFIG.startRow}`, 'INFO');
    log(`  Batch Size: ${CONFIG.batchSize}`, 'INFO');
    log(`  Max Concurrent: ${CONFIG.maxConcurrent}`, 'INFO');
    log(`  Delay: ${CONFIG.delayBetweenRequests}ms`, 'INFO');
    log('', 'INFO');

    // Find CSV file (support wildcard)
    let csvPath = CONFIG.paganiniCsvPath;
    if (csvPath.includes('*')) {
      const glob = await import('glob');
      const files = glob.sync(csvPath);
      if (files.length === 0) {
        throw new Error(`No CSV files found matching pattern: ${csvPath}`);
      }
      // Use the most recent file
      csvPath = files.sort().pop();
      log(`Found CSV file: ${csvPath}`, 'INFO');
    }

    // Parse CSV
    log('Loading CSV file...', 'INFO');
    const allData = await parsePaganiniCSV(csvPath);
    log('', 'INFO');

    // Get batch
    const startRow = CONFIG.startRow;
    const endRow = Math.min(startRow + CONFIG.batchSize, allData.length);
    const batch = allData.slice(startRow, endRow);

    log(`Processing batch: rows ${startRow + 1} to ${endRow} (${batch.length} items)`, 'INFO');
    log('', 'INFO');

    // Process products with rate limiting
    
    const stats = {
      total: batch.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };

    // Process with rate limiter
    const tasks = batch.map((row, index) => async () => {
      const result = await processProduct(row, startRow + index);
      
      if (result.created) stats.created++;
      if (result.updated) stats.updated++;
      if (result.skipped) stats.skipped++;
      if (result.error) stats.errors++;
      
      return result;
    });

    // Execute with progress tracking
    await rateLimiter.executeTasks(tasks, (completed, total, error) => {
      if (completed % 5 === 0 || completed === total) {
        const timingStats = timer.getTimingStats(5);
        log(`Progress: ${completed}/${total} (${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped) | Lap: ${timingStats.lapTimeFormatted} (${timingStats.avgTimePerItem}ms/product) | Total: ${timingStats.totalElapsedFormatted}`, 'INFO');
        timer.updateLapTimer();
      }
    });
    
    // Final summary with elapsed time
    const finalElapsedTime = timer.getElapsedTime();
    const finalElapsedFormatted = timer.getFormattedElapsedTime();
    
    log('', 'INFO');
    log('=== Migration Complete ===', 'SUCCESS');
    log(`Total processed: ${stats.total}`, 'INFO');
    log(`Created: ${stats.created}`, 'SUCCESS');
    log(`Updated: ${stats.updated}`, 'SUCCESS');
    log(`Skipped: ${stats.skipped}`, 'INFO');
    log(`Errors: ${stats.errors}`, stats.errors > 0 ? 'ERROR' : 'INFO');
    log(`Elapsed time: ${finalElapsedFormatted} (${finalElapsedTime}ms)`, 'INFO');
    log('', 'INFO');
    log(`Log file: ${logger.getLogFile()}`, 'INFO');

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'ERROR');
    console.error(error);
    process.exit(1);
  }
}

// Run migration
main();
