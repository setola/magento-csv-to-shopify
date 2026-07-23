// paganini-default-location-cleanup.js
import dotenv from "dotenv";

import Logger from "./utils/Logger.js";
import ShopifyClient from "./utils/ShopifyClient.js";

// This script removes Paganini inventory items from the default Shopify location.
// It does NOT touch product data: title, images, price, tags, variants, etc.
// Dry-run is the default. Set CONFIRM_WRITE=true to execute writes.

dotenv.config();

const logger = new Logger();

const CONFIG = {
	shopifyStore: process.env.SHOPIFY_STORE_URL,
	shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
	defaultLocationId: process.env.SHOPIFY_LOCATION_ID,
	paganiniLocationId: process.env.PAGANINI_LOCATION_ID,
	paganiniLocationName: process.env.PAGANINI_LOCATION_NAME || "Paganini",
	confirmWrite: process.env.CONFIRM_WRITE === "true",
	limit: parseInt(process.env.LIMIT || "0"),
	zeroDefaultOnHand: process.env.ZERO_DEFAULT_ON_HAND === "true",
};

function log(message, type = "INFO") {
	logger.log(message, type);
}

const shopifyClient = new ShopifyClient(CONFIG, log);

function normalizeLocationId(locationId) {
	if (!locationId) {
		return null;
	}

	return locationId.startsWith("gid://")
		? locationId
		: `gid://shopify/Location/${locationId}`;
}

async function getPaganiniLocationId() {
	const explicitLocationId = normalizeLocationId(CONFIG.paganiniLocationId);
	if (explicitLocationId) {
		log("Using Paganini location from PAGANINI_LOCATION_ID", "INFO");
		return explicitLocationId;
	}

	const location = await shopifyClient.findLocationByName(
		CONFIG.paganiniLocationName,
	);
	if (!location) {
		throw new Error(
			`Active Shopify location named "${CONFIG.paganiniLocationName}" not found. Set PAGANINI_LOCATION_ID to override.`,
		);
	}

	log(
		`Using Shopify location "${location.name}" for Paganini inventory`,
		"INFO",
	);
	return location.id;
}

async function listPaganiniInventoryItems(paganiniLocationId) {
	const query = `
    query listPaganiniInventory($locationId: ID!, $after: String) {
      location(id: $locationId) {
        id
        name
        inventoryLevels(first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              item {
                id
                sku
                variant {
                  id
                  product {
                    id
                    title
                    tags
                  }
                }
                inventoryLevels(first: 20) {
                  edges {
                    node {
                      id
                      location {
                        id
                        name
                      }
                      quantities(names: ["available", "on_hand"]) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

	const items = [];
	let after = null;

	do {
		const result = await shopifyClient.query(query, {
			locationId: paganiniLocationId,
			after,
		});

		const inventoryLevels = result.location?.inventoryLevels;
		if (!inventoryLevels) {
			throw new Error(
				`Could not read inventory levels for Paganini location ${paganiniLocationId}`,
			);
		}

		for (const edge of inventoryLevels.edges) {
			items.push(edge.node.item);

			if (CONFIG.limit > 0 && items.length >= CONFIG.limit) {
				return items;
			}
		}

		after = inventoryLevels.pageInfo.hasNextPage
			? inventoryLevels.pageInfo.endCursor
			: null;
	} while (after);

	return items;
}

function getQuantity(inventoryLevel, name) {
	return (
		inventoryLevel.quantities.find((quantity) => quantity.name === name)
			?.quantity || 0
	);
}

function buildCleanupCandidate(item, defaultLocationId) {
	const defaultInventoryLevel = (item.inventoryLevels?.edges || [])
		.map((edge) => edge.node)
		.find((inventoryLevel) => inventoryLevel.location.id === defaultLocationId);

	if (!defaultInventoryLevel) {
		return null;
	}

	return {
		sku: item.sku,
		inventoryItemId: item.id,
		inventoryLevelId: defaultInventoryLevel.id,
		productId: item.variant?.product?.id,
		productTitle: item.variant?.product?.title,
		defaultLocationName: defaultInventoryLevel.location.name,
		available: getQuantity(defaultInventoryLevel, "available"),
		onHand: getQuantity(defaultInventoryLevel, "on_hand"),
	};
}

async function setDefaultLocationOnHandToZero(candidate, defaultLocationId) {
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
				inventoryItemId: candidate.inventoryItemId,
				locationId: defaultLocationId,
				quantity: 0,
			},
		],
	};

	const result = await shopifyClient.query(mutation, { input });
	const userErrors = result.inventorySetOnHandQuantities?.userErrors || [];

	if (userErrors.length > 0) {
		throw new Error(JSON.stringify(userErrors));
	}
}

async function deactivateInventoryLevel(inventoryLevelId) {
	const mutation = `
    mutation inventoryDeactivate($inventoryLevelId: ID!) {
      inventoryDeactivate(inventoryLevelId: $inventoryLevelId) {
        userErrors {
          field
          message
        }
      }
    }
  `;

	const result = await shopifyClient.query(mutation, { inventoryLevelId });
	const userErrors = result.inventoryDeactivate?.userErrors || [];

	if (userErrors.length > 0) {
		throw new Error(JSON.stringify(userErrors));
	}
}

async function main() {
	try {
		log("=== Paganini Default Location Cleanup ===", "INFO");
		log(
			`Mode: ${CONFIG.confirmWrite ? "WRITE" : "DRY-RUN"}`,
			CONFIG.confirmWrite ? "WARN" : "INFO",
		);
		log(
			`Default Location ID: ${normalizeLocationId(CONFIG.defaultLocationId)}`,
			"INFO",
		);
		log(
			`Paganini Location: ${CONFIG.paganiniLocationId ? "PAGANINI_LOCATION_ID override" : CONFIG.paganiniLocationName}`,
			"INFO",
		);
		log(`Limit: ${CONFIG.limit > 0 ? CONFIG.limit : "none"}`, "INFO");
		log(
			`Zero default on-hand before deactivate: ${CONFIG.zeroDefaultOnHand}`,
			"INFO",
		);

		const defaultLocationId = normalizeLocationId(CONFIG.defaultLocationId);
		if (!defaultLocationId) {
			throw new Error(
				"SHOPIFY_LOCATION_ID is required for the default location to clean up.",
			);
		}

		const paganiniLocationId = await getPaganiniLocationId();
		if (defaultLocationId === paganiniLocationId) {
			throw new Error(
				"Default location and Paganini location are the same. Aborting.",
			);
		}

		const items = await listPaganiniInventoryItems(paganiniLocationId);
		const candidates = items
			.map((item) => buildCleanupCandidate(item, defaultLocationId))
			.filter(Boolean);

		const nonZeroCandidates = candidates.filter(
			(candidate) => candidate.available !== 0 || candidate.onHand !== 0,
		);
		const blockedCandidates = candidates.filter(
			(candidate) => candidate.onHand !== 0 && !CONFIG.zeroDefaultOnHand,
		);

		log("", "INFO");
		log(`Inventory items found at Paganini: ${items.length}`, "INFO");
		log(`Also stocked at default location: ${candidates.length}`, "INFO");
		log(
			`Default location non-zero quantities: ${nonZeroCandidates.length}`,
			nonZeroCandidates.length > 0 ? "WARN" : "INFO",
		);
		log(
			`Would skip because on_hand != 0 and ZERO_DEFAULT_ON_HAND is false: ${blockedCandidates.length}`,
			blockedCandidates.length > 0 ? "WARN" : "INFO",
		);

		if (candidates.length > 0) {
			log("", "INFO");
			log("Sample candidates:", "INFO");
			for (const candidate of candidates.slice(0, 20)) {
				log(
					`  ${candidate.sku} | ${candidate.defaultLocationName} available=${candidate.available}, on_hand=${candidate.onHand} | ${candidate.productTitle}`,
					"INFO",
				);
			}
		}

		if (!CONFIG.confirmWrite) {
			log("", "INFO");
			log(
				"Dry-run only. Re-run with CONFIRM_WRITE=true to deactivate these default-location inventory levels.",
				"WARN",
			);
			log(`Log file: ${logger.getLogFile()}`, "INFO");
			return;
		}

		let deactivated = 0;
		let zeroed = 0;
		let skipped = 0;
		let errors = 0;

		for (const candidate of candidates) {
			try {
				if (candidate.onHand !== 0) {
					if (!CONFIG.zeroDefaultOnHand) {
						skipped++;
						log(
							`↷ Skipping ${candidate.sku}: default on_hand=${candidate.onHand}. Set ZERO_DEFAULT_ON_HAND=true to zero first.`,
							"WARN",
						);
						continue;
					}

					await setDefaultLocationOnHandToZero(candidate, defaultLocationId);
					zeroed++;
					log(`  ↳ Set default on_hand to 0 for ${candidate.sku}`, "DEBUG");
				}

				await deactivateInventoryLevel(candidate.inventoryLevelId);
				deactivated++;
				log(`✓ Deactivated default location for ${candidate.sku}`, "SUCCESS");
			} catch (error) {
				errors++;
				log(`✗ Failed ${candidate.sku}: ${error.message}`, "ERROR");
			}
		}

		log("", "INFO");
		log("=== Cleanup Complete ===", errors > 0 ? "WARN" : "SUCCESS");
		log(`Candidates: ${candidates.length}`, "INFO");
		log(`Deactivated: ${deactivated}`, "SUCCESS");
		log(`Zeroed first: ${zeroed}`, "INFO");
		log(`Skipped: ${skipped}`, skipped > 0 ? "WARN" : "INFO");
		log(`Errors: ${errors}`, errors > 0 ? "ERROR" : "INFO");
		log(`Log file: ${logger.getLogFile()}`, "INFO");

		if (errors > 0) {
			process.exitCode = 1;
		}
	} catch (error) {
		log(`Fatal error: ${error.message}`, "ERROR");
		console.error(error);
		process.exit(1);
	}
}

main();
