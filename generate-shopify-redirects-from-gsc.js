// generate-shopify-redirects-from-gsc.js
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

import dotenv from "dotenv";
import Papa from "papaparse";

import Logger from "./utils/Logger.js";
import ShopifyClient from "./utils/ShopifyClient.js";

dotenv.config();

const logger = new Logger();

const CONFIG = {
	shopifyStore: process.env.SHOPIFY_STORE_URL,
	shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
	inputPath:
		process.env.GSC_404_CSV ||
		"./data/planetshooters.com-Coverage-Drilldown-2026-07-23/Tabella.csv",
	outputPath:
		process.env.REDIRECT_OUTPUT_CSV || "./data/shopify_redirects_from_gsc.csv",
	rejectedPath:
		process.env.REDIRECT_REJECTED_CSV ||
		"./data/shopify_redirects_from_gsc_rejected.csv",
	createRedirects: process.env.CREATE_REDIRECTS === "true",
	limit: parseInt(process.env.LIMIT || "0"),
	delayMs: parseInt(process.env.DELAY_MS || "150"),
};

function log(message, type = "INFO") {
	logger.log(message, type);
}

const shopifyClient = new ShopifyClient(CONFIG, log);
const productHandleCache = new Map();

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeMagentoReferer(pathname) {
	const match = pathname.match(/\/customer\/account\/login\/referer\/([^/]+)/);
	if (!match) {
		return null;
	}

	let encoded = match[1].replace(/-/g, "+").replace(/_/g, "/");
	while (encoded.length % 4) {
		encoded += "=";
	}

	try {
		return Buffer.from(encoded, "base64").toString("utf8");
	} catch (_error) {
		return null;
	}
}

function parseUrl(rawUrl) {
	try {
		return new URL(rawUrl);
	} catch (_error) {
		return null;
	}
}

function normalizePath(pathname) {
	if (!pathname || pathname === "/") {
		return "/";
	}

	return (
		decodeURIComponent(pathname).replace(/\/+/g, "/").replace(/\/$/, "") || "/"
	);
}

function extractRedirectCandidate(rawUrl) {
	const originalUrl = parseUrl(rawUrl);
	if (!originalUrl) {
		return { rejectedReason: "Invalid URL" };
	}

	const decodedRefererUrl = decodeMagentoReferer(originalUrl.pathname);
	const sourceUrl = decodedRefererUrl
		? parseUrl(decodedRefererUrl)
		: originalUrl;
	if (!sourceUrl) {
		return { rejectedReason: "Invalid decoded referer URL" };
	}

	const sourcePath = normalizePath(sourceUrl.pathname);
	const originalPath = normalizePath(originalUrl.pathname);

	let handle = null;
	let redirectFrom = originalPath;
	let sourceType = "other";

	const productMatch = sourcePath.match(
		/^\/(?:[a-z]{2}\/)??products\/([^/?#]+)/i,
	);
	if (productMatch) {
		handle = productMatch[1];
		redirectFrom = originalPath;
		sourceType = "shopify-product-path";
	} else if (sourcePath.endsWith(".html")) {
		handle = path.basename(sourcePath, ".html");
		redirectFrom = originalPath;
		sourceType = decodedRefererUrl ? "magento-login-referer" : "magento-html";
	}

	if (!handle) {
		return {
			redirectFrom: originalPath,
			sourcePath,
			rejectedReason: "No product handle candidate",
		};
	}

	const redirectTo = `/products/${handle}`;

	if (redirectFrom === redirectTo) {
		return {
			redirectFrom,
			redirectTo,
			handle,
			sourcePath,
			rejectedReason: "Already canonical product path",
		};
	}

	return {
		redirectFrom,
		redirectTo,
		handle,
		sourcePath,
		sourceType,
		originalUrl: rawUrl,
	};
}

async function productExistsByHandle(handle) {
	if (productHandleCache.has(handle)) {
		return productHandleCache.get(handle);
	}

	const query = `
    query productByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        handle
      }
    }
  `;

	const result = await shopifyClient.query(query, { handle });
	const product = result.productByHandle || null;
	productHandleCache.set(handle, product);
	await delay(CONFIG.delayMs);
	return product;
}

async function createShopifyRedirect(redirect) {
	const mutation = `
    mutation urlRedirectCreate($urlRedirect: UrlRedirectInput!) {
      urlRedirectCreate(urlRedirect: $urlRedirect) {
        urlRedirect {
          id
          path
          target
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

	const result = await shopifyClient.query(mutation, {
		urlRedirect: {
			path: redirect.redirectFrom,
			target: redirect.redirectTo,
		},
	});
	const userErrors = result.urlRedirectCreate?.userErrors || [];

	if (userErrors.length > 0) {
		throw new Error(JSON.stringify(userErrors));
	}

	return result.urlRedirectCreate.urlRedirect;
}

function writeCsv(filePath, rows) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, Papa.unparse(rows), "utf8");
}

async function main() {
	try {
		log("=== Generate Shopify Redirects From GSC 404 Export ===", "INFO");
		log(
			`Mode: ${CONFIG.createRedirects ? "CREATE REDIRECTS" : "DRY-RUN CSV ONLY"}`,
			CONFIG.createRedirects ? "WARN" : "INFO",
		);
		log(`Input: ${CONFIG.inputPath}`, "INFO");
		log(`Output: ${CONFIG.outputPath}`, "INFO");
		log(`Rejected: ${CONFIG.rejectedPath}`, "INFO");
		log(`Limit: ${CONFIG.limit > 0 ? CONFIG.limit : "none"}`, "INFO");

		const csv = fs.readFileSync(CONFIG.inputPath, "utf8");
		const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
		const rows =
			CONFIG.limit > 0 ? parsed.data.slice(0, CONFIG.limit) : parsed.data;

		const candidatesByFrom = new Map();
		const rejected = [];

		for (const row of rows) {
			const rawUrl = row.URL;
			const candidate = extractRedirectCandidate(rawUrl);

			if (candidate.rejectedReason) {
				rejected.push({
					URL: rawUrl,
					SourcePath: candidate.sourcePath || "",
					RedirectFrom: candidate.redirectFrom || "",
					RedirectTo: candidate.redirectTo || "",
					Reason: candidate.rejectedReason,
				});
				continue;
			}

			if (!candidatesByFrom.has(candidate.redirectFrom)) {
				candidatesByFrom.set(candidate.redirectFrom, candidate);
			}
		}

		const redirectRows = [];
		const unresolved = [];
		let checked = 0;

		for (const candidate of candidatesByFrom.values()) {
			checked++;
			if (checked % 25 === 0) {
				log(
					`Checked ${checked}/${candidatesByFrom.size} handle candidates...`,
					"INFO",
				);
			}

			const product = await productExistsByHandle(candidate.handle);
			if (!product) {
				unresolved.push({
					URL: candidate.originalUrl,
					SourcePath: candidate.sourcePath,
					RedirectFrom: candidate.redirectFrom,
					RedirectTo: candidate.redirectTo,
					Handle: candidate.handle,
					Reason: "No Shopify product found with this handle",
				});
				continue;
			}

			redirectRows.push({
				"Redirect from": candidate.redirectFrom,
				"Redirect to": `/products/${product.handle}`,
				Handle: product.handle,
				Product: product.title,
				SourceType: candidate.sourceType,
			});
		}

		writeCsv(
			CONFIG.outputPath,
			redirectRows.map((row) => ({
				"Redirect from": row["Redirect from"],
				"Redirect to": row["Redirect to"],
			})),
		);
		writeCsv(CONFIG.rejectedPath, [...rejected, ...unresolved]);

		log("", "INFO");
		log(`Input URLs: ${rows.length}`, "INFO");
		log(`Unique redirect candidates: ${candidatesByFrom.size}`, "INFO");
		log(`Valid redirects: ${redirectRows.length}`, "SUCCESS");
		log(
			`Rejected/unresolved: ${rejected.length + unresolved.length}`,
			rejected.length + unresolved.length > 0 ? "WARN" : "INFO",
		);
		log(`Wrote redirect CSV: ${CONFIG.outputPath}`, "SUCCESS");
		log(`Wrote rejected CSV: ${CONFIG.rejectedPath}`, "INFO");

		if (!CONFIG.createRedirects) {
			log(
				"Dry-run only. Import the CSV in Shopify, or re-run with CREATE_REDIRECTS=true to create redirects via API.",
				"WARN",
			);
			log(`Log file: ${logger.getLogFile()}`, "INFO");
			return;
		}

		let created = 0;
		let errors = 0;

		for (const redirect of redirectRows) {
			try {
				await createShopifyRedirect({
					redirectFrom: redirect["Redirect from"],
					redirectTo: redirect["Redirect to"],
				});
				created++;
				log(
					`✓ Created redirect ${redirect["Redirect from"]} -> ${redirect["Redirect to"]}`,
					"SUCCESS",
				);
			} catch (error) {
				errors++;
				log(
					`✗ Failed redirect ${redirect["Redirect from"]}: ${error.message}`,
					"ERROR",
				);

				if (error.message.includes("write_online_store_navigation")) {
					log(
						"Aborting: Shopify token is missing the write_online_store_navigation scope required to create redirects.",
						"ERROR",
					);
					break;
				}
			}
		}

		log("", "INFO");
		log("=== Redirect Creation Complete ===", errors > 0 ? "WARN" : "SUCCESS");
		log(`Created: ${created}`, "SUCCESS");
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
