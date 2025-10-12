// product-migrate.js
import fs from 'fs';
import dotenv from 'dotenv';

// Import utilities
import Normalizers from './utils/Normalizers.js';
import TimeTracker from './utils/TimeTracker.js';
import Logger from './utils/Logger.js';
import ShopifyClient from './utils/ShopifyClient.js';
import CSVParser from './utils/CSVParser.js';
import RateLimiter from './utils/RateLimiter.js';

dotenv.config();

// Initialize logger
const logger = new Logger();

// Configurazione
const CONFIG = {
  shopifyStore: process.env.SHOPIFY_STORE_URL, // es: mystore.myshopify.com
  shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  magentoBaseUrl: process.env.MAGENTO_BASE_URL || '',
  magentoMediaPath: process.env.MAGENTO_MEDIA_PATH || '/pub/media/catalog/product',
  csvPath: process.env.CSV_PATH || './data/products.csv',
  startRow: parseInt(process.env.START_ROW || '0'),
  batchSize: parseInt(process.env.BATCH_SIZE || '100'),
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '2'),
  delayBetweenRequests: parseInt(process.env.DELAY_MS || '500')
};

// Logger wrapper function to maintain compatibility
function log(message, type = 'INFO') {
  logger.log(message, type);
}

// Initialize utilities
const shopifyClient = new ShopifyClient(CONFIG, log);
const csvParser = new CSVParser(log);
const rateLimiter = new RateLimiter(CONFIG, log);

// GraphQL Client per Shopify (now using utility)
const shopifyGraphQL = (query, variables = {}) => shopifyClient.query(query, variables);
const delay = ms => shopifyClient.delay(ms);


// Determine if product should be published based on inventory availability
function shouldPublishProduct(productData) {
  // Check if the product has any quantity available
  const qty = parseInt(productData.qty || 0);
  
  // Only publish if inventory > 0
  if (qty > 0) {
    log(`  ↳ Publishing product: ${qty} units available`, 'DEBUG');
    return true;
  } else {
    log(`  ↳ Keeping product as draft: ${qty} units available`, 'DEBUG');
    return false;
  }
}

// Cerca prodotto esistente tramite SKU (now using utility)
const findProductBySku = sku => shopifyClient.findProductBySku(sku);

// Aggiorna prodotto esistente su Shopify
async function updateShopifyProduct(productId, variantId, productData) {
  const mutation = `
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

  // Create normalizer instance for this product
  const normalizer = new Normalizers(CONFIG, log, productData);
  
  // Prepara media input per le immagini (evitando duplicati)
  const mediaInputs = normalizer.normalizeImages();

  // Map categories to Shopify taxonomy
  const normalizedTags = normalizer.normalizeProductTags();
  const taxonomyResult = normalizer.mapCategoryToShopifyTaxonomy(normalizedTags);
  if (taxonomyResult) {
    log(`  ↳ Mapped category tag "${taxonomyResult.matchedTag}" to taxonomy: ${taxonomyResult.taxonomy}`, 'DEBUG');
  }
  
  // Determine if product should be published based on inventory
  const shouldPublish = shouldPublishProduct(productData);
  
  const input = {
    id: productId,
    title: productData.name,
    descriptionHtml: productData.description || '',
    vendor: productData.manufacturer || '',
    productType: normalizer.normalizeAttributeSetCode(),
    status: normalizer.normalizeProductStatus(),
    tags: normalizedTags
  };
  
  // Only set publishedAt if product should be published (has inventory > 0)
  if (shouldPublish) {
    input.publishedAt = new Date().toISOString();
  }
  
  // Add category if taxonomy mapping is available
  if (taxonomyResult) {
    // Shopify expects a Global ID for taxonomy, not the taxonomy path
    // Format: gid://shopify/ProductTaxonomyNode/{taxonomy_path}
    input.category = `gid://shopify/ProductTaxonomyNode/${taxonomyResult.taxonomy}`;
  }

  if (productData.meta_title || productData.meta_description) {
    input.seo = {
      title: productData.meta_title || productData.name,
      description: productData.meta_description || ''
    };
  }

  try {
    const result = await shopifyGraphQL(mutation, { input });

    if (result.productUpdate?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(result.productUpdate.userErrors));
    }

    log(`↻ Updated product: ${productData.name} (ID: ${productId})`, 'SUCCESS');

    // Aggiorna immagini se presenti
    if (mediaInputs.length > 0) {
      await delay(CONFIG.delayBetweenRequests / 2);
      await updateProductMedia(productId, mediaInputs);
    }

    // Aggiorna variante
    await delay(CONFIG.delayBetweenRequests / 2);
    await updateProductVariant(variantId, productData);
    
    // Product publication based on inventory availability

    return result.productUpdate.product;
  } catch (error) {
    log(`✗ Failed to update product ${productData.sku}: ${error.message}`, 'ERROR');
    throw error;
  }
}

// Aggiorna media del prodotto
async function updateProductMedia(productId, mediaInputs) {
  // Prima eliminiamo le immagini esistenti
  const deleteQuery = `
    query getProductMedia($id: ID!) {
      product(id: $id) {
        media(first: 250) {
          edges {
            node {
              id
            }
          }
        }
      }
    }
  `;

  try {
    const existingMedia = await shopifyGraphQL(deleteQuery, { id: productId });
    const mediaIds = existingMedia.product?.media?.edges?.map(e => e.node.id) || [];

    if (mediaIds.length > 0) {
      const deleteMutation = `
        mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
          productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
            deletedMediaIds
            userErrors {
              field
              message
            }
          }
        }
      `;

      await shopifyGraphQL(deleteMutation, { productId, mediaIds });
      await delay(CONFIG.delayBetweenRequests / 2);
    }

    // Poi aggiungiamo le nuove immagini
    const createMutation = `
      mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
        productCreateMedia(media: $media, productId: $productId) {
          media {
            id
          }
          mediaUserErrors {
            field
            message
          }
        }
      }
    `;

    const result = await shopifyGraphQL(createMutation, { 
      productId, 
      media: mediaInputs 
    });

    if (result.productCreateMedia?.mediaUserErrors?.length > 0) {
      throw new Error(JSON.stringify(result.productCreateMedia.mediaUserErrors));
    }

    log(`  ↳ Updated ${mediaInputs.length} images`, 'DEBUG');
  } catch (error) {
    log(`  ↳ Warning: Failed to update media: ${error.message}`, 'WARN');
  }
}


// Crea prodotto su Shopify
async function createShopifyProduct(productData) {
  const mutation = `
    mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
        product {
          id
          title
          handle
          status
          variants(first: 1) {
            edges {
              node {
                id
                sku
                price
                inventoryPolicy
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

  // Create normalizer instance for this product
  const normalizer = new Normalizers(CONFIG, log, productData);
  
  // Prepara media input per le immagini (evitando duplicati)
  const mediaInputs = normalizer.normalizeImages();

  // Map categories to Shopify taxonomy
  const normalizedTags = normalizer.normalizeProductTags();
  const taxonomyResult = normalizer.mapCategoryToShopifyTaxonomy(normalizedTags);
  if (taxonomyResult) {
    log(`  ↳ Mapped category tag "${taxonomyResult.matchedTag}" to taxonomy: ${taxonomyResult.taxonomy}`, 'DEBUG');
  }
  
  // Determine if product should be published based on inventory
  const shouldPublish = shouldPublishProduct(productData);
  
  const input = {
    title: productData.name,
    descriptionHtml: productData.description || '',
    vendor: productData.manufacturer || '',
    productType: normalizer.normalizeAttributeSetCode(),
    handle: productData.url_key,
    status: normalizer.normalizeProductStatus(),
    tags: normalizedTags
  };
  
  // Only set publishedAt if product should be published (has inventory > 0)
  if (shouldPublish) {
    input.publishedAt = new Date().toISOString();
  }
  
  // Add category if taxonomy mapping is available
  if (taxonomyResult) {
    // Shopify expects a Global ID for taxonomy, not the taxonomy path
    // Format: gid://shopify/ProductTaxonomyNode/{taxonomy_path}
    input.category = `gid://shopify/ProductTaxonomyNode/${taxonomyResult.taxonomy}`;
  }

  // Aggiungi SEO solo se ci sono dati
  if (productData.meta_title || productData.meta_description) {
    input.seo = {
      title: productData.meta_title || productData.name,
      description: productData.meta_description || ''
    };
  }

  try {
    const result = await shopifyGraphQL(mutation, { 
      input,
      media: mediaInputs.length > 0 ? mediaInputs : null
    });

    if (result.productCreate?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(result.productCreate.userErrors));
    }

    const product = result.productCreate.product;
    log(`✓ Created product: ${product.title} (ID: ${product.id})`, 'SUCCESS');

    // Create new variant with SKU using productVariantsBulkCreate (removes default variant)
    await delay(CONFIG.delayBetweenRequests / 2);
    await createVariantWithSku(product.id, productData);
    
    // Product publication based on inventory availability
    
    // Note: The product.variants from productCreate shows the old default variant.
    // The actual variant with SKU is created by createVariantWithSku function above.

    return product;
  } catch (error) {
    log(`✗ Failed to create product ${productData.sku}: ${error.message}`, 'ERROR');
    throw error;
  }
}


// Create variant with SKU using productVariantsBulkCreate (replaces default variant)
async function createVariantWithSku(productId, productData) {
  const mutation = `
    mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $strategy: ProductVariantsBulkCreateStrategy) {
      productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
        productVariants {
          id
          sku
          price
          inventoryPolicy
          inventoryItem {
            id
            sku
            countryCodeOfOrigin
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Prepare inventoryItem with SKU, cost, and country of manufacture
  const inventoryItemInput = {
    sku: productData.sku, // SKU goes in inventoryItem!
    tracked: true // Enable inventory tracking
  };

  // Add cost if available
  if (productData.cost) {
    const costValue = parseFloat(productData.cost.replace(/[^\d.-]/g, ''));
    if (!isNaN(costValue) && costValue > 0) {
      inventoryItemInput.cost = costValue.toFixed(2);
    }
  }

  // Add country of manufacture if available
  const normalizer = new Normalizers(CONFIG, log, productData);
  const countryCode = normalizer.normalizeCountryOfManufacture();
  if (countryCode) {
    inventoryItemInput.countryCodeOfOrigin = countryCode;
  }

  // Create variant input
  const variantInput = {
    price: parseFloat(productData.price || '0').toFixed(2),
    inventoryPolicy: 'DENY', // Don't allow sales when out of stock
    inventoryItem: inventoryItemInput,
    optionValues: [{
      optionName: 'Title', // Default option for simple products
      name: 'Default Title' // Default value
    }],
    inventoryQuantities: process.env.SHOPIFY_LOCATION_ID && productData.qty ? [{
      availableQuantity: parseInt(productData.qty || 0),
      locationId: process.env.SHOPIFY_LOCATION_ID
    }] : undefined
  };

  try {
    const result = await shopifyGraphQL(mutation, {
      productId,
      variants: [variantInput],
      strategy: 'REMOVE_STANDALONE_VARIANT' // This removes the default variant
    });

    if (result.productVariantsBulkCreate?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(result.productVariantsBulkCreate.userErrors));
    }

    const variant = result.productVariantsBulkCreate.productVariants?.[0];
    if (variant) {
      const country = variant.inventoryItem?.countryCodeOfOrigin ? ` - Origin: ${variant.inventoryItem.countryCodeOfOrigin}` : '';
      log(`  ↳ Variant created with SKU: ${variant.inventoryItem?.sku || variant.sku} - $${variant.price}${country}`, 'DEBUG');
      return variant;
    }
  } catch (error) {
    log(`  ↳ Warning: Failed to create variant with SKU: ${error.message}`, 'WARN');
    throw error;
  }
}

// Aggiorna variante con SKU, prezzo e inventario (used for existing products)
async function updateProductVariant(variantId, productData) {
  try {
    // Step 1: Update variant with price only
    await updateVariantPricing(variantId, productData);
    
    // Step 2: Enable inventory tracking and set cost
    await enableInventoryTracking(variantId, productData);
    
    // Step 3: Set inventory quantities
    if (process.env.SHOPIFY_LOCATION_ID && productData.qty) {
      await delay(CONFIG.delayBetweenRequests / 2);
      await updateInventory(variantId, parseInt(productData.qty));
    }

    log(`  ↳ Variant updated: SKU=${productData.sku}, Price=${parseFloat(productData.price || '0').toFixed(2)}${productData.cost ? `, Cost=${parseFloat(productData.cost.replace(/[^\d.-]/g, '')).toFixed(2)}` : ''}`, 'DEBUG');
    
    return true;
  } catch (error) {
    log(`  ↳ Warning: Failed to update variant ${variantId}: ${error.message}`, 'WARN');
    return false;
  }
}

// Update variant with SKU and pricing using productVariantsBulkUpdate
async function updateVariantPricing(variantId, productData) {
  const mutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          sku
          price
          inventoryPolicy
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Get product ID from variant
  const getProductQuery = `
    query getProductFromVariant($id: ID!) {
      productVariant(id: $id) {
        product {
          id
        }
      }
    }
  `;

  const productData2 = await shopifyGraphQL(getProductQuery, { id: variantId });
  const productId = productData2.productVariant?.product?.id;

  if (!productId) {
    throw new Error('Could not find product ID from variant');
  }

  // According to the forum post, we should create the variant input based on ProductVariantsBulkInput
  // Let's try a minimal approach first - just the fields we know work
  const variantInput = {
    id: variantId,  // The existing variant ID
    price: parseFloat(productData.price || '0').toFixed(2),
    inventoryPolicy: 'DENY'
  };

  // Note: SKU is NOT supported in ProductVariantsBulkInput
  // We'll need to handle SKU separately

  const result = await shopifyGraphQL(mutation, { 
    productId, 
    variants: [variantInput] 
  });

  if (result.productVariantsBulkUpdate?.userErrors?.length > 0) {
    throw new Error(JSON.stringify(result.productVariantsBulkUpdate.userErrors));
  }

  const variant = result.productVariantsBulkUpdate.productVariants?.[0];
  if (variant) {
    log(`  ↳ SKU and price set: ${variant.sku || 'undefined'} - $${variant.price}`, 'DEBUG');
  }
}

// Enable inventory tracking and set country of manufacture
async function enableInventoryTracking(variantId, productData) {
  const mutation = `
    mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem {
          id
          tracked
          countryCodeOfOrigin
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Get inventory item ID
  const getInventoryQuery = `
    query getInventoryItem($id: ID!) {
      productVariant(id: $id) {
        inventoryItem {
          id
          tracked
        }
      }
    }
  `;

  const inventoryData = await shopifyGraphQL(getInventoryQuery, { id: variantId });
  const inventoryItemId = inventoryData.productVariant?.inventoryItem?.id;

  if (!inventoryItemId) {
    throw new Error('Inventory item not found');
  }

  const input = {
    tracked: true, // Enable inventory tracking
    requiresShipping: true
  };

  // Add country of manufacture if available
  const normalizer = new Normalizers(CONFIG, log, productData);
  const countryCode = normalizer.normalizeCountryOfManufacture();
  if (countryCode) {
    input.countryCodeOfOrigin = countryCode;
  }

  const result = await shopifyGraphQL(mutation, { 
    id: inventoryItemId, 
    input 
  });

  if (result.inventoryItemUpdate?.userErrors?.length > 0) {
    throw new Error(JSON.stringify(result.inventoryItemUpdate.userErrors));
  }

  const countryInfo = countryCode ? ` - Origin: ${countryCode}` : '';
  log(`  ↳ Inventory tracking enabled${countryInfo}`, 'DEBUG');
}


// Aggiorna inventario
async function updateInventory(variantId, quantity) {
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

  // Estrai l'inventory item ID dalla variante
  const queryInventory = `
    query getInventoryItem($id: ID!) {
      productVariant(id: $id) {
        inventoryItem {
          id
        }
      }
    }
  `;

  try {
    const inventoryData = await shopifyGraphQL(queryInventory, { id: variantId });
    const inventoryItemId = inventoryData.productVariant?.inventoryItem?.id;

    if (!inventoryItemId) {
      throw new Error('Inventory item not found');
    }

    const input = {
      reason: "correction",
      setQuantities: [{
        inventoryItemId: inventoryItemId,
        locationId: process.env.SHOPIFY_LOCATION_ID,
        quantity: quantity
      }]
    };

    await delay(CONFIG.delayBetweenRequests / 2);
    const result = await shopifyGraphQL(mutation, { input });

    if (result.inventorySetOnHandQuantities?.userErrors?.length > 0) {
      throw new Error(JSON.stringify(result.inventorySetOnHandQuantities.userErrors));
    }

    log(`  ↳ Set inventory to ${quantity} units`, 'DEBUG');
  } catch (error) {
    log(`  ↳ Warning: Failed to update inventory: ${error.message}`, 'WARN');
  }
}

// Parsing CSV Magento (now using utility)
const parseMagentoCSV = csvPath => csvParser.parseCSV(csvPath);

// Estrai attributi aggiuntivi da additional_attributes
function parseAdditionalAttributes(attrString) {
  const attrs = {};
  if (!attrString) return attrs;

  const pairs = attrString.split(',');
  pairs.forEach(pair => {
    const [key, ...valueParts] = pair.split('=');
    if (key && valueParts.length > 0) {
      attrs[key.trim()] = valueParts.join('=').trim();
    }
  });

  return attrs;
}

// Process a single product
async function processProduct(product, index, stats) {
  try {
    // Skip prodotti senza SKU o nome
    const missingSku = !product.sku || product.sku.trim() === '';
    const missingName = !product.name || product.name.trim() === '';
    
    if (missingSku || missingName) {
      let skipReason;
      if (missingSku && missingName) {
        skipReason = 'Missing both SKU and name';
      } else if (missingSku) {
        skipReason = `Missing SKU (name: "${product.name}")`;
      } else {
        skipReason = `Missing name (SKU: "${product.sku}")`;
      }
      
      log(`Skipping product at row ${index}: ${skipReason}`, 'WARN');
      stats.skipped++;
      return;
    }

    // Parsing attributi aggiuntivi
    const additionalAttrs = parseAdditionalAttributes(product.additional_attributes);
    const enrichedProduct = { ...product, ...additionalAttrs };

    // Cerca se il prodotto esiste già
    log(`Processing SKU: ${enrichedProduct.sku}`, 'DEBUG');
    const existingProduct = await findProductBySku(enrichedProduct.sku);

    if (existingProduct) {
      // Aggiorna prodotto esistente
      log(`Found existing product for SKU ${enrichedProduct.sku}, updating...`, 'INFO');
      const variantId = existingProduct.variants?.edges?.[0]?.node?.id;
      await updateShopifyProduct(existingProduct.id, variantId, enrichedProduct);
      stats.updated++;
    } else {
      // Crea nuovo prodotto
      log(`Creating new product for SKU ${enrichedProduct.sku}`, 'INFO');
      await createShopifyProduct(enrichedProduct);
      stats.created++;
    }

    stats.success++;
    return { success: true };
  } catch (error) {
    stats.failed++;
    log(`Failed processing row ${index}: ${error.message}`, 'ERROR');
    return { error: true, message: error.message };
  }
}

// Main migration function
async function migrateProducts() {
  const timer = new TimeTracker();
  log('=== Starting Magento 2 to Shopify Migration ===');
  log(`Config: Start Row=${CONFIG.startRow}, Batch Size=${CONFIG.batchSize}`);

  try {
    // Carica CSV
    log('Loading CSV file...');
    const allProducts = await parseMagentoCSV(CONFIG.csvPath);
    log(`Total products in CSV: ${allProducts.length}`);

    // Get batch using utility
    const batchInfo = csvParser.getBatch(allProducts, CONFIG.startRow, CONFIG.batchSize);
    const productsToMigrate = batchInfo.batch;
    
    log(`Migrating rows ${batchInfo.startRow} to ${batchInfo.endRow} (${productsToMigrate.length} products)`);

    // Stats
    const stats = {
      total: productsToMigrate.length,
      success: 0,
      failed: 0,
      skipped: 0,
      created: 0,
      updated: 0
    };

    // Process products with utility rate limiter
    const tasks = productsToMigrate.map((product, idx) => 
      () => processProduct(product, CONFIG.startRow + idx, stats)
    );

    // Execute with progress tracking
    await rateLimiter.executeTasks(tasks, (completed, total, error) => {
      if (completed % 10 === 0 || completed === total) {
        const timingStats = timer.getTimingStats(10);
        log(`Progress: ${completed}/${total} processed (${stats.created} created, ${stats.updated} updated) | Lap: ${timingStats.lapTimeFormatted} (${timingStats.avgTimePerItem}ms/product) | Total: ${timingStats.totalElapsedFormatted}`);
        timer.updateLapTimer();
      }
    });

    // Final stats with elapsed time
    const finalElapsedTime = timer.getElapsedTime();
    const finalElapsedFormatted = timer.getFormattedElapsedTime();
    
    log('=== Migration Complete ===');
    log(`Total: ${stats.total}, Success: ${stats.success} (${stats.created} created, ${stats.updated} updated), Failed: ${stats.failed}, Skipped: ${stats.skipped}`);
    log(`Elapsed time: ${finalElapsedFormatted} (${finalElapsedTime}ms)`);
    
    if (stats.failed > 0) {
      log('⚠ Some products failed to migrate. Check the log for details.', 'WARN');
      process.exit(1);
    }

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'ERROR');
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
    console.error(`ERROR: CSV file not found: ${CONFIG.csvPath}`);
    process.exit(1);
  }

  if (!process.env.SHOPIFY_LOCATION_ID) {
    console.error('WARNING: SHOPIFY_LOCATION_ID not set. Inventory quantities will not be set.');
  }

  if (!CONFIG.magentoBaseUrl) {
    console.warn('WARNING: MAGENTO_BASE_URL not set. Images with relative paths will be skipped.');
    console.warn('Set MAGENTO_BASE_URL in .env to import images (e.g., https://www.yourstore.com)');
  }
}

// Run
validateConfig();
migrateProducts();