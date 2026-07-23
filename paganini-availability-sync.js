// paganini-availability-sync.js
import fs from "node:fs";
import dotenv from "dotenv";
import Papa from "papaparse";

// Import utilities
import PaganiniNormalizer from "./utils/PaganiniNormalizer.js";
import TimeTracker from "./utils/TimeTracker.js";
import Logger from "./utils/Logger.js";
import ShopifyClient from "./utils/ShopifyClient.js";
import RateLimiter from "./utils/RateLimiter.js";

dotenv.config();

// Initialize logger
const logger = new Logger();

// Configuration
const CONFIG = {
	shopifyStore: process.env.SHOPIFY_STORE_URL,
	shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
	shopifyLocationId: process.env.SHOPIFY_LOCATION_ID,
	paganiniLocationId: process.env.PAGANINI_LOCATION_ID,
	paganiniLocationName: process.env.PAGANINI_LOCATION_NAME || "Paganini",
	paganiniProductFilter: process.env.PAGANINI_PRODUCT_FILTER || "optics",
	paganiniCsvPath:
		process.env.PAGANINI_CSV_PATH || "./data/paganini_data_*.csv",
	startRow: parseInt(process.env.START_ROW || "0"),
	batchSize: parseInt(process.env.BATCH_SIZE || "100"),
	maxConcurrent: parseInt(process.env.MAX_CONCURRENT || "3"),
	delayBetweenRequests: parseInt(process.env.DELAY_MS || "300"),
};

// Logger wrapper function
function log(message, type = "INFO") {
	logger.log(message, type);
}

// Initialize utilities
const shopifyClient = new ShopifyClient(CONFIG, log);
const rateLimiter = new RateLimiter(CONFIG, log);
let resolvedPaganiniLocationId = null;

/**
 * Resolve the Shopify location where Paganini inventory must be stocked.
 * PAGANINI_LOCATION_ID can be used as an explicit override; otherwise the
 * active location named PAGANINI_LOCATION_NAME (default: "Paganini") is used.
 * @returns {Promise<string>} Shopify location GID
 */
async function getPaganiniLocationId() {
	if (resolvedPaganiniLocationId) {
		return resolvedPaganiniLocationId;
	}

	if (CONFIG.paganiniLocationId) {
		resolvedPaganiniLocationId = normalizeLocationId(CONFIG.paganiniLocationId);
		log(`Using Paganini location from PAGANINI_LOCATION_ID`, "INFO");
		return resolvedPaganiniLocationId;
	}

	const location = await shopifyClient.findLocationByName(
		CONFIG.paganiniLocationName,
	);
	if (!location) {
		throw new Error(
			`Active Shopify location named "${CONFIG.paganiniLocationName}" not found. Set PAGANINI_LOCATION_ID to override.`,
		);
	}

	resolvedPaganiniLocationId = location.id;
	log(
		`Using Shopify location "${location.name}" for Paganini inventory`,
		"INFO",
	);
	return resolvedPaganiniLocationId;
}

function normalizeLocationId(locationId) {
	if (!locationId) {
		return null;
	}

	return locationId.startsWith("gid://")
		? locationId
		: `gid://shopify/Location/${locationId}`;
}

function isInventoryNotStockedError(userErrors) {
	const message = JSON.stringify(userErrors).toLowerCase();
	return message.includes("stock") && message.includes("location");
}

async function activateInventoryAtLocation(
	inventoryItemId,
	locationId,
	quantity,
) {
	const mutation = `
    mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!, $available: Int) {
      inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId, available: $available) {
        inventoryLevel {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

	const result = await shopifyClient.query(mutation, {
		inventoryItemId,
		locationId,
		available: quantity,
	});
	const userErrors = result.inventoryActivate?.userErrors || [];

	if (userErrors.length > 0 && !isInventoryNotStockedError(userErrors)) {
		throw new Error(JSON.stringify(userErrors));
	}

	log(`  ↳ Inventory activated at ${CONFIG.paganiniLocationName}`, "DEBUG");
}

/**
 * Parse Paganini CSV file (semicolon-separated)
 * @param {string} csvPath - Path to CSV file
 * @returns {Promise<Array>} Parsed CSV data
 */
async function parsePaganiniCSV(csvPath) {
	return new Promise((resolve, reject) => {
		fs.readFile(csvPath, "utf8", (err, data) => {
			if (err) {
				log(`Error reading CSV file: ${err.message}`, "ERROR");
				reject(err);
				return;
			}

			Papa.parse(data, {
				header: true,
				skipEmptyLines: true,
				delimiter: ";", // Paganini CSV uses semicolon separator
				complete: (results) => {
					log(
						`CSV parsed successfully: ${results.data.length} rows found`,
						"INFO",
					);
					resolve(results.data);
				},
				error: (error) => {
					log(`Error parsing CSV: ${error.message}`, "ERROR");
					reject(error);
				},
			});
		});
	});
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
          inventoryLevels(first: 20) {
            edges {
              node {
                location {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

	try {
		const result = await shopifyClient.query(query, { id: variantId });
		const inventoryItem = result.productVariant?.inventoryItem;
		const inventoryItemId = inventoryItem?.id;
		const stockedLocationIds = new Set(
			(inventoryItem?.inventoryLevels?.edges || []).map(
				(edge) => edge.node.location.id,
			),
		);

		if (!inventoryItemId) {
			log(
				`Warning: Could not find inventory item for variant ${variantId}`,
				"WARN",
			);
			return false;
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

		const paganiniLocationId = await getPaganiniLocationId();

		const defaultLocationId = normalizeLocationId(CONFIG.shopifyLocationId);
		const setQuantities = [
			{
				inventoryItemId: inventoryItemId,
				locationId: paganiniLocationId,
				quantity: quantity,
			},
		];

		if (
			defaultLocationId &&
			defaultLocationId !== paganiniLocationId &&
			stockedLocationIds.has(defaultLocationId)
		) {
			setQuantities.push({
				inventoryItemId: inventoryItemId,
				locationId: defaultLocationId,
				quantity: 0,
			});
		}

		const input = {
			reason: "correction",
			setQuantities,
		};

		let inventoryResult = await shopifyClient.query(mutation, { input });
		let userErrors =
			inventoryResult.inventorySetOnHandQuantities?.userErrors || [];

		if (userErrors.length > 0 && isInventoryNotStockedError(userErrors)) {
			await activateInventoryAtLocation(
				inventoryItemId,
				paganiniLocationId,
				quantity,
			);
			inventoryResult = await shopifyClient.query(mutation, { input });
			userErrors =
				inventoryResult.inventorySetOnHandQuantities?.userErrors || [];
		}

		if (userErrors.length > 0) {
			throw new Error(JSON.stringify(userErrors));
		}

		return true;
	} catch (error) {
		log(`Warning: Failed to update inventory: ${error.message}`, "WARN");
		return false;
	}
}

/**
 * Process a single product availability update
 * @param {Object} rowData - Raw CSV row data
 * @param {number} index - Row index
 */
async function processAvailability(rowData, index) {
	try {
		// Create normalizer instance
		const normalizer = new PaganiniNormalizer(CONFIG, log, rowData);

		// Check if product should be processed (LEUPOLD only)
		if (!normalizer.shouldImport()) {
			return { skipped: true, reason: "Not LEUPOLD" };
		}

		// Get SKU and quantity
		const sku = normalizer.generateSKU();
		const quantity = normalizer.normalizeAvailability();

		if (!sku) {
			log(`✗ Row ${index + 1}: Failed to generate SKU`, "ERROR");
			return { error: "SKU generation failed" };
		}

		// Find product by SKU
		const existingProduct = await shopifyClient.findProductBySku(sku);

		if (!existingProduct) {
			log(`↷ Row ${index + 1}: Product not found (SKU: ${sku})`, "DEBUG");
			return { skipped: true, reason: "Product not found", sku };
		}

		const variantId = existingProduct.variants.edges[0].node.id;

		// Update inventory
		const success = await updateInventoryQuantity(variantId, quantity);

		if (success) {
			log(`✓ Updated availability for ${sku}: ${quantity} units`, "SUCCESS");
			return { updated: true, sku, quantity };
		} else {
			return { error: "Failed to update inventory", sku };
		}
	} catch (error) {
		log(`✗ Row ${index + 1}: ${error.message}`, "ERROR");
		return { error: error.message };
	}
}

/**
 * Main sync function
 */
async function main() {
	const timer = new TimeTracker();

	try {
		log("=== Starting Paganini Availability Sync ===", "INFO");
		log(`Configuration:`, "INFO");
		log(`  CSV Path: ${CONFIG.paganiniCsvPath}`, "INFO");
		log(`  Start Row: ${CONFIG.startRow}`, "INFO");
		log(`  Batch Size: ${CONFIG.batchSize}`, "INFO");
		log(`  Max Concurrent: ${CONFIG.maxConcurrent}`, "INFO");
		log(`  Delay: ${CONFIG.delayBetweenRequests}ms`, "INFO");
		log(`  Product Filter: ${CONFIG.paganiniProductFilter}`, "INFO");
		log(
			`  Paganini Location: ${CONFIG.paganiniLocationId ? "PAGANINI_LOCATION_ID override" : CONFIG.paganiniLocationName}`,
			"INFO",
		);
		await getPaganiniLocationId();
		log("", "INFO");

		// Find CSV file (support wildcard)
		let csvPath = CONFIG.paganiniCsvPath;
		if (csvPath.includes("*")) {
			const glob = await import("glob");
			const files = glob.sync(csvPath);
			if (files.length === 0) {
				throw new Error(`No CSV files found matching pattern: ${csvPath}`);
			}
			// Use the most recent file
			csvPath = files.sort().pop();
			log(`Found CSV file: ${csvPath}`, "INFO");
		}

		// Parse CSV
		log("Loading CSV file...", "INFO");
		const allData = await parsePaganiniCSV(csvPath);
		log("", "INFO");

		// Filter before batching so we do not spend time processing irrelevant CSV rows.
		const importableRows = allData
			.map((row, index) => ({ row, index }))
			.filter(({ row }) =>
				new PaganiniNormalizer(CONFIG, log, row).shouldImport(),
			);

		log(
			`Filtered products: ${importableRows.length}/${allData.length} rows match ${CONFIG.paganiniProductFilter}`,
			"INFO",
		);

		// Get batch from the filtered list.
		const startRow = CONFIG.startRow;
		const endRow = Math.min(startRow + CONFIG.batchSize, importableRows.length);
		const batch = importableRows.slice(startRow, endRow);

		log(
			`Processing filtered batch: items ${startRow + 1} to ${endRow} (${batch.length} items)`,
			"INFO",
		);
		log("", "INFO");

		// Stats
		const stats = {
			total: batch.length,
			updated: 0,
			skipped: 0,
			errors: 0,
			notFound: 0,
		};

		// Process with rate limiter
		const tasks = batch.map(({ row, index }) => async () => {
			const result = await processAvailability(row, index);

			if (result.updated) stats.updated++;
			if (result.skipped) {
				stats.skipped++;
				if (result.reason === "Product not found") stats.notFound++;
			}
			if (result.error) stats.errors++;

			return result;
		});

		// Execute with progress tracking
		await rateLimiter.executeTasks(tasks, (completed, total, _error) => {
			if (completed % 10 === 0 || completed === total) {
				const timingStats = timer.getTimingStats(10);
				log(
					`Progress: ${completed}/${total} (${stats.updated} updated, ${stats.notFound} not found, ${stats.skipped} skipped) | Lap: ${timingStats.lapTimeFormatted} (${timingStats.avgTimePerItem}ms/item) | Total: ${timingStats.totalElapsedFormatted}`,
					"INFO",
				);
				timer.updateLapTimer();
			}
		});

		// Final summary with elapsed time
		const finalElapsedTime = timer.getElapsedTime();
		const finalElapsedFormatted = timer.getFormattedElapsedTime();

		log("", "INFO");
		log("=== Availability Sync Complete ===", "SUCCESS");
		log(`Total processed: ${stats.total}`, "INFO");
		log(`Updated: ${stats.updated}`, "SUCCESS");
		log(`Not found: ${stats.notFound}`, "WARN");
		log(`Skipped: ${stats.skipped}`, "INFO");
		log(`Errors: ${stats.errors}`, stats.errors > 0 ? "ERROR" : "INFO");
		log(
			`Elapsed time: ${finalElapsedFormatted} (${finalElapsedTime}ms)`,
			"INFO",
		);
		log("", "INFO");
		log(`Log file: ${logger.getLogFile()}`, "INFO");
	} catch (error) {
		log(`Fatal error: ${error.message}`, "ERROR");
		console.error(error);
		process.exit(1);
	}
}

// Run sync
main();
