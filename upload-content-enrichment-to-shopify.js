import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

import Logger from "./utils/Logger.js";
import ShopifyClient from "./utils/ShopifyClient.js";

dotenv.config();

const DEFAULT_PRODUCT_DIR =
	"./data/content-enrichment/leupold-vx-4hd-3-12x40-cds-zl2-firedot-twilight-hunter";

const CONFIG = {
	productDir: process.env.PRODUCT_DIR || DEFAULT_PRODUCT_DIR,
	confirmWrite: process.env.CONFIRM_WRITE === "true",
	updateContent: process.env.UPDATE_CONTENT !== "false",
	uploadImages: process.env.UPLOAD_IMAGES !== "false",
	maxImagePixels: Number(process.env.MAX_IMAGE_PIXELS || 20000000),
	minImageWidth: Number(process.env.MIN_IMAGE_WIDTH || 500),
	minImageHeight: Number(process.env.MIN_IMAGE_HEIGHT || 500),
	minImagePixels: Number(process.env.MIN_IMAGE_PIXELS || 500000),
	shopifyStore: process.env.SHOPIFY_STORE_URL,
	shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
};

const logger = new Logger();
const log = (message, level = "INFO") => logger.log(message, level);

const shopify = new ShopifyClient(
	{
		shopifyStore: CONFIG.shopifyStore,
		shopifyAccessToken: CONFIG.shopifyAccessToken,
	},
	log,
);

function readContentMarkdown(productDir) {
	const contentPath = path.join(productDir, "content.md");
	if (!fs.existsSync(contentPath)) {
		throw new Error(`Missing content file: ${contentPath}`);
	}

	return fs.readFileSync(contentPath, "utf8");
}

function extractTableValue(markdown, label) {
	const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const regex = new RegExp(
		`\\|\\s*${escapedLabel}\\s*\\|\\s*([^|]+?)\\s*\\|`,
		"i",
	);
	const match = markdown.match(regex);
	return match ? match[1].trim().replace(/^`|`$/g, "") : "";
}

function extractFencedBlockAfterHeading(markdown, heading, language = "") {
	const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const escapedLanguage = language.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern =
		"## " +
		escapedHeading +
		"[\\s\\S]*?```" +
		escapedLanguage +
		"\\n([\\s\\S]*?)\\n```";
	const regex = new RegExp(pattern, "i");
	const match = markdown.match(regex);
	return match ? match[1].trim() : "";
}

function parseImageRows(markdown, productDir) {
	const imageRows = [];
	const imageSection =
		markdown.match(/## Immagini locali([\s\S]*?)(?:\n## |$)/i)?.[1] || "";
	const rowRegex =
		/\|\s*`(images\/[^`]+)`\s*\|[^|]*\|\s*`([^`]+)`\s*\|[^|]*\|/g;

	for (const match of imageSection.matchAll(rowRegex)) {
		const relativePath = match[1].trim();
		const altText = match[2].trim();
		const absolutePath = path.join(productDir, relativePath);

		imageRows.push({
			relativePath,
			absolutePath,
			altText,
		});
	}

	return imageRows;
}

function parseMarkdown(markdown, productDir) {
	const productId = extractTableValue(markdown, "Product ID");
	const title = extractFencedBlockAfterHeading(
		markdown,
		"Titolo consigliato",
		"txt",
	);
	const descriptionHtml = extractFencedBlockAfterHeading(
		markdown,
		"Descrizione Shopify HTML",
		"html",
	);
	const seoTitle = extractFencedBlockAfterHeading(markdown, "SEO title", "txt");
	const seoDescription = extractFencedBlockAfterHeading(
		markdown,
		"SEO meta description",
		"txt",
	);
	const productType = extractFencedBlockAfterHeading(
		markdown,
		"Product type consigliato",
		"txt",
	);
	const tags = extractFencedBlockAfterHeading(
		markdown,
		"Tag consigliati",
		"txt",
	)
		.split("\n")
		.map((tag) => tag.trim())
		.filter(Boolean);
	const images = parseImageRows(markdown, productDir);

	if (!productId) {
		throw new Error("Product ID not found in content.md");
	}
	if (!title) {
		throw new Error("Recommended title not found in content.md");
	}
	if (!descriptionHtml) {
		throw new Error("Shopify HTML description not found in content.md");
	}

	return {
		productId,
		title,
		descriptionHtml,
		seoTitle,
		seoDescription,
		productType,
		tags,
		images,
	};
}

async function getProduct(productId) {
	const query = `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        legacyResourceId
        title
        handle
        productType
        tags
        seo {
          title
          description
        }
        images(first: 100) {
          edges {
            node {
              id
              altText
              url
            }
          }
        }
      }
    }
  `;

	const result = await shopify.query(query, { id: productId });
	if (!result.product) {
		throw new Error(`Product not found: ${productId}`);
	}

	return result.product;
}

async function updateProductContent(content) {
	const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

	const input = {
		id: content.productId,
		title: content.title,
		descriptionHtml: content.descriptionHtml,
		productType: content.productType,
		tags: content.tags,
		seo: {
			title: content.seoTitle,
			description: content.seoDescription,
		},
	};

	const result = await shopify.query(mutation, { input });
	const errors = result.productUpdate?.userErrors || [];
	if (errors.length > 0) {
		throw new Error(JSON.stringify(errors));
	}

	return result.productUpdate.product;
}

function getMimeType(filePath) {
	const extension = path.extname(filePath).toLowerCase();
	switch (extension) {
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".png":
			return "image/png";
		case ".webp":
			return "image/webp";
		default:
			throw new Error(`Unsupported image extension: ${extension}`);
	}
}

function getImageDimensions(filePath) {
	try {
		const output = execFileSync("identify", ["-format", "%w %h", filePath], {
			encoding: "utf8",
		});
		const [width, height] = output.trim().split(/\s+/).map(Number);
		if (!width || !height) {
			return null;
		}
		return { width, height, pixels: width * height };
	} catch (_error) {
		return null;
	}
}

function annotateImages(images) {
	return images.map((image) => ({
		...image,
		dimensions: getImageDimensions(image.absolutePath),
		duplicateKey: getImageDuplicateKey(image.relativePath),
	}));
}

function getImageDuplicateKey(relativePath) {
	return path
		.basename(relativePath, path.extname(relativePath))
		.toLowerCase()
		.replace(/^\d+[a-z]?[-_]/, "")
		.replace(/[-_](large|small|thumb|thumbnail|backup|shopify)$/g, "")
		.replace(/[-_]\d+x\d+$/g, "");
}

function findOversizedImages(images) {
	return images.filter(
		(image) =>
			image.dimensions && image.dimensions.pixels > CONFIG.maxImagePixels,
	);
}

function isTooSmallImage(image) {
	const dimensions = image.dimensions;
	return (
		!dimensions ||
		dimensions.width < CONFIG.minImageWidth ||
		dimensions.height < CONFIG.minImageHeight ||
		dimensions.pixels < CONFIG.minImagePixels
	);
}

function filterUploadableImages(images) {
	const skipped = [];
	const candidates = [];

	for (const image of images) {
		if (isTooSmallImage(image)) {
			skipped.push({
				image,
				reason: image.dimensions
					? `too small (${image.dimensions.width}x${image.dimensions.height}, ${image.dimensions.pixels} pixels)`
					: "dimensions unavailable",
			});
			continue;
		}

		candidates.push(image);
	}

	const bestByDuplicateKey = new Map();
	for (const image of candidates) {
		const current = bestByDuplicateKey.get(image.duplicateKey);
		if (!current || image.dimensions.pixels > current.dimensions.pixels) {
			if (current) {
				skipped.push({
					image: current,
					reason: `duplicate of ${image.relativePath}; keeping larger image`,
				});
			}
			bestByDuplicateKey.set(image.duplicateKey, image);
			continue;
		}

		skipped.push({
			image,
			reason: `duplicate of ${current.relativePath}; keeping larger image`,
		});
	}

	return {
		images: [...bestByDuplicateKey.values()],
		skipped,
	};
}

async function uploadProductImage({ legacyProductId, image }) {
	if (!fs.existsSync(image.absolutePath)) {
		throw new Error(`Missing image file: ${image.absolutePath}`);
	}

	const attachment = fs.readFileSync(image.absolutePath).toString("base64");
	const mimeType = getMimeType(image.absolutePath);
	const filename = path.basename(image.absolutePath);
	const url = `https://${CONFIG.shopifyStore}/admin/api/2024-10/products/${legacyProductId}/images.json`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Shopify-Access-Token": CONFIG.shopifyAccessToken,
		},
		body: JSON.stringify({
			image: {
				attachment,
				filename,
				alt: image.altText,
			},
		}),
	});

	const result = await response.json();
	if (!response.ok) {
		throw new Error(JSON.stringify(result));
	}

	log(`Uploaded ${filename} (${mimeType})`, "SUCCESS");
	return result.image;
}

async function main() {
	try {
		log("=== Upload Content Enrichment To Shopify ===", "INFO");
		log(`Product dir: ${CONFIG.productDir}`, "INFO");
		log(
			`Mode: ${CONFIG.confirmWrite ? "WRITE" : "DRY-RUN"}`,
			CONFIG.confirmWrite ? "WARN" : "INFO",
		);
		log(`Update content: ${CONFIG.updateContent}`, "INFO");
		log(`Upload images: ${CONFIG.uploadImages}`, "INFO");
		log(
			`Image limits: min ${CONFIG.minImageWidth}x${CONFIG.minImageHeight} and ${CONFIG.minImagePixels} pixels; max ${CONFIG.maxImagePixels} pixels`,
			"INFO",
		);

		if (!CONFIG.shopifyStore || !CONFIG.shopifyAccessToken) {
			throw new Error("Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN");
		}

		const markdown = readContentMarkdown(CONFIG.productDir);
		const content = parseMarkdown(markdown, CONFIG.productDir);
		const annotatedImages = annotateImages(content.images);
		const oversizedImages = CONFIG.uploadImages
			? findOversizedImages(annotatedImages)
			: [];

		if (oversizedImages.length > 0) {
			for (const image of oversizedImages) {
				log(
					`Oversized image: ${image.relativePath} (${image.dimensions.width}x${image.dimensions.height}, ${image.dimensions.pixels} pixels). Shopify limit is ${CONFIG.maxImagePixels} pixels.`,
					"ERROR",
				);
			}
			throw new Error(
				"One or more images exceed Shopify's pixel limit. Resize them before uploading.",
			);
		}

		const imageFilterResult = CONFIG.uploadImages
			? filterUploadableImages(annotatedImages)
			: { images: [], skipped: [] };

		const product = await getProduct(content.productId);
		const existingAltTexts = new Set(
			(product.images?.edges || [])
				.map((edge) => edge.node.altText)
				.filter(Boolean),
		);
		const imagesToUpload = imageFilterResult.images.filter(
			(image) => !existingAltTexts.has(image.altText),
		);

		log("", "INFO");
		log(`Shopify product: ${product.title}`, "INFO");
		log(`Handle: ${product.handle}`, "INFO");
		log(`New title: ${content.title}`, "INFO");
		log(`Product type: ${content.productType}`, "INFO");
		log(`Tags: ${content.tags.join(", ")}`, "INFO");
		log(`SEO title: ${content.seoTitle}`, "INFO");
		log(`SEO description: ${content.seoDescription}`, "INFO");
		log(`Description HTML length: ${content.descriptionHtml.length}`, "INFO");
		log(`Existing images: ${product.images.edges.length}`, "INFO");
		log(`Images in content: ${content.images.length}`, "INFO");
		log(
			`Images skipped before upload: ${imageFilterResult.skipped.length}`,
			"INFO",
		);
		for (const skipped of imageFilterResult.skipped) {
			log(`Skipping ${skipped.image.relativePath}: ${skipped.reason}`, "WARN");
		}
		log(
			`Images to upload after size/duplicate/alt-text dedupe: ${imagesToUpload.length}`,
			"INFO",
		);

		if (!CONFIG.confirmWrite) {
			log(
				"Dry-run only. Re-run with CONFIRM_WRITE=true to update Shopify.",
				"WARN",
			);
			log(`Log file: ${logger.getLogFile()}`, "INFO");
			return;
		}

		if (CONFIG.updateContent) {
			const updatedProduct = await updateProductContent(content);
			log(`Updated product content: ${updatedProduct.title}`, "SUCCESS");
		}

		if (CONFIG.uploadImages) {
			for (const image of imagesToUpload) {
				await uploadProductImage({
					legacyProductId: product.legacyResourceId,
					image,
				});
			}
		}

		log("", "INFO");
		log("=== Content Enrichment Upload Complete ===", "SUCCESS");
		log(`Log file: ${logger.getLogFile()}`, "INFO");
	} catch (error) {
		log(`Fatal error: ${error.message}`, "ERROR");
		console.error(error);
		process.exit(1);
	}
}

main();
