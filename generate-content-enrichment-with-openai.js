import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

import Logger from "./utils/Logger.js";
import ShopifyClient from "./utils/ShopifyClient.js";

dotenv.config();

const CONFIG = {
	shopifyStore: process.env.SHOPIFY_STORE_URL,
	shopifyAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
	aiProvider: process.env.AI_PROVIDER || "openai",
	openAiApiKey: process.env.OPENAI_API_KEY,
	openAiApiUrl: process.env.OPENAI_API_URL,
	openAiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
	geminiApiKey: process.env.GEMINI_API_KEY,
	geminiApiUrl: process.env.GEMINI_API_URL,
	geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
	outputDir: process.env.CONTENT_OUTPUT_DIR || "./data/content-enrichment",
	productHandle: process.env.PRODUCT_HANDLE || "",
	productQuery: process.env.PRODUCT_QUERY || "status:active",
	maxPages: Number(process.env.MAX_PAGES || 20),
	pageSize: Number(process.env.PAGE_SIZE || 50),
	minDescriptionChars: Number(process.env.MIN_DESCRIPTION_CHARS || 180),
	downloadImages: process.env.DOWNLOAD_IMAGES !== "false",
	maxImages: Number(process.env.MAX_IMAGES || 6),
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

function stripHtml(html) {
	return (html || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function isContentless(product) {
	const descriptionText = stripHtml(product.descriptionHtml);
	const imageCount = product.images?.edges?.length || 0;
	const seoDescription = product.seo?.description || "";
	return (
		descriptionText.length < CONFIG.minDescriptionChars &&
		imageCount === 0 &&
		seoDescription.length < 80
	);
}

function slugify(value) {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 120);
}

function escapeMarkdownTable(value) {
	return String(value || "")
		.replace(/\|/g, "\\|")
		.replace(/\n/g, " ")
		.trim();
}

async function getProductByHandle(handle) {
	const query = `
    query getProductByHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        handle
        vendor
        productType
        status
        descriptionHtml
        onlineStoreUrl
        seo { title description }
        images(first: 10) { edges { node { id url altText } } }
        variants(first: 10) { edges { node { id title sku price inventoryQuantity } } }
      }
    }
  `;

	const result = await shopify.query(query, { handle });
	return result.productByHandle;
}

async function findFirstContentlessProduct() {
	if (CONFIG.productHandle) {
		const product = await getProductByHandle(CONFIG.productHandle);
		if (!product) {
			throw new Error(`Product not found by handle: ${CONFIG.productHandle}`);
		}
		return product;
	}

	const query = `
    query findProducts($query: String!, $cursor: String, $pageSize: Int!) {
      products(first: $pageSize, after: $cursor, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges {
          cursor
          node {
            id
            title
            handle
            vendor
            productType
            status
            descriptionHtml
            onlineStoreUrl
            seo { title description }
            images(first: 10) { edges { node { id url altText } } }
            variants(first: 10) { edges { node { id title sku price inventoryQuantity } } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

	let cursor = null;
	let scanned = 0;
	for (let page = 0; page < CONFIG.maxPages; page++) {
		const result = await shopify.query(query, {
			query: CONFIG.productQuery,
			cursor,
			pageSize: CONFIG.pageSize,
		});
		const products = result.products;

		for (const edge of products.edges) {
			scanned++;
			if (isContentless(edge.node)) {
				log(`Scanned ${scanned} products before finding candidate`, "INFO");
				return edge.node;
			}
		}

		if (!products.pageInfo.hasNextPage) {
			break;
		}
		cursor = products.pageInfo.endCursor;
	}

	throw new Error(
		`No contentless product found after scanning ${scanned} products with query: ${CONFIG.productQuery}`,
	);
}

function buildContentPrompt(product) {
	const variants = product.variants.edges.map((edge) => edge.node);
	const skus = variants.map((variant) => variant.sku).filter(Boolean);

	return `
Sei un esperto ecommerce SEO italiano per prodotti di ottica, caccia, tiro sportivo e accessori.

Genera contenuti Shopify in italiano per questo prodotto, usando fonti ufficiali del produttore quando possibile. Se usi il web, privilegia pagina ufficiale del brand, cataloghi ufficiali, distributori autorevoli. Non inventare specifiche non verificabili: se un dato non è certo, omettilo.

Prodotto Shopify:
- Titolo attuale: ${product.title}
- Handle: ${product.handle}
- Vendor: ${product.vendor || ""}
- Product type attuale: ${product.productType || ""}
- SKU: ${skus.join(", ")}
- URL Shopify: ${product.onlineStoreUrl || ""}
- Prezzi varianti: ${variants.map((variant) => `${variant.sku || variant.title}: ${variant.price}`).join("; ")}

Restituisci SOLO JSON valido con questa struttura:
{
  "sourceUrls": ["https://..."],
  "recommendedTitle": "Titolo prodotto pulito",
  "recommendedHandle": "handle-seo-opzionale",
  "commercialDescriptionMarkdown": "Testo descrittivo in markdown, 3 paragrafi massimo",
  "descriptionHtml": "HTML Shopify con paragrafi, h2, ul e tabella tecnica",
  "keyFeatures": ["..."],
  "idealFor": ["..."],
  "technicalSpecs": [{"name":"Marca", "value":"...", "source":"..."}],
  "seoTitle": "max circa 60 caratteri",
  "seoDescription": "max circa 155-160 caratteri",
  "productType": "Categoria prodotto Shopify",
  "vendor": "Vendor normalizzato",
  "tags": ["tag"],
  "images": [{"url":"https://...", "usage":"Immagine prodotto principale", "altText":"Alt text SEO italiano"}],
  "notes": ["eventuali note o cautele"]
}
`;
}

async function callOpenAi(product) {
	if (!CONFIG.openAiApiKey || !CONFIG.openAiApiUrl) {
		throw new Error("Missing OPENAI_API_KEY or OPENAI_API_URL");
	}

	const body = {
		model: CONFIG.openAiModel,
		input: buildContentPrompt(product),
		tools: [{ type: "web_search_preview" }],
	};

	const response = await fetch(CONFIG.openAiApiUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${CONFIG.openAiApiKey}`,
		},
		body: JSON.stringify(body),
	});

	const result = await response.json();
	if (!response.ok) {
		throw new Error(JSON.stringify(result));
	}

	const outputText =
		result.output_text ||
		result.output
			?.flatMap((item) => item.content || [])
			.map((content) => content.text || "")
			.join("") ||
		"";

	if (!outputText) {
		throw new Error(
			`OpenAI returned no output text: ${JSON.stringify(result)}`,
		);
	}

	try {
		return parseJsonFromOpenAiOutput(outputText);
	} catch (error) {
		throw new Error(
			`OpenAI returned invalid JSON: ${error.message}. Output starts with: ${outputText.slice(0, 500)}`,
		);
	}
}

async function callGemini(product) {
	if (!CONFIG.geminiApiKey || !CONFIG.geminiApiUrl) {
		throw new Error("Missing GEMINI_API_KEY or GEMINI_API_URL");
	}

	const endpoint = `${CONFIG.geminiApiUrl}/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`;
	const body = {
		contents: [
			{
				role: "user",
				parts: [{ text: buildContentPrompt(product) }],
			},
		],
		generationConfig: {
			responseMimeType: "application/json",
		},
	};

	const response = await fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	const result = await response.json();
	if (!response.ok) {
		throw new Error(JSON.stringify(result));
	}

	const outputText =
		result.candidates?.[0]?.content?.parts
			?.map((part) => part.text || "")
			.join("") || "";

	if (!outputText) {
		throw new Error(
			`Gemini returned no output text: ${JSON.stringify(result)}`,
		);
	}

	try {
		return parseJsonFromOpenAiOutput(outputText);
	} catch (error) {
		throw new Error(
			`Gemini returned invalid JSON: ${error.message}. Output starts with: ${outputText.slice(0, 500)}`,
		);
	}
}

async function callAi(product) {
	switch (CONFIG.aiProvider.toLowerCase()) {
		case "gemini":
			return callGemini(product);
		case "openai":
			return callOpenAi(product);
		default:
			throw new Error(`Unsupported AI_PROVIDER: ${CONFIG.aiProvider}`);
	}
}

async function downloadImage(url, outputPath) {
	const response = await fetch(url, {
		headers: { "User-Agent": "Mozilla/5.0" },
	});
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

function parseJsonFromOpenAiOutput(outputText) {
	try {
		return JSON.parse(outputText);
	} catch (_error) {
		const fencedJson = outputText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
		if (fencedJson) {
			return JSON.parse(fencedJson[1]);
		}

		const firstBrace = outputText.indexOf("{");
		const lastBrace = outputText.lastIndexOf("}");
		if (firstBrace !== -1 && lastBrace > firstBrace) {
			return JSON.parse(outputText.slice(firstBrace, lastBrace + 1));
		}

		throw _error;
	}
}

function inferImageExtension(url) {
	try {
		const pathname = new URL(url).pathname.toLowerCase();
		const extension = path.extname(pathname);
		if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
			return extension;
		}
	} catch (_error) {
		return ".jpg";
	}

	return ".jpg";
}

async function downloadGeneratedImages(generated, productDir) {
	const imagesDir = path.join(productDir, "images");
	fs.mkdirSync(imagesDir, { recursive: true });

	const downloaded = [];
	const images = (generated.images || []).slice(0, CONFIG.maxImages);

	for (const [index, image] of images.entries()) {
		try {
			if (!image.url || !image.url.startsWith("http")) {
				continue;
			}
			const extension = inferImageExtension(image.url);
			const filename = `${String(index + 1).padStart(2, "0")}-${slugify(image.usage || image.altText || "image")}${extension}`;
			const absolutePath = path.join(imagesDir, filename);
			await downloadImage(image.url, absolutePath);
			downloaded.push({
				...image,
				relativePath: `images/${filename}`,
			});
			log(`Downloaded image: ${filename}`, "SUCCESS");
		} catch (error) {
			log(`Failed to download image ${image.url}: ${error.message}`, "WARN");
		}
	}

	return downloaded;
}

function buildMarkdown({ product, generated, downloadedImages }) {
	const variants = product.variants.edges.map((edge) => edge.node);
	const skuList = variants
		.map((variant) => variant.sku)
		.filter(Boolean)
		.join(", ");
	const imageRows = downloadedImages
		.map(
			(image) =>
				`| \`${image.relativePath}\` | ${escapeMarkdownTable(image.usage)} | \`${escapeMarkdownTable(image.altText)}\` | ${escapeMarkdownTable(image.url)} |`,
		)
		.join("\n");
	const sourceUrls = (generated.sourceUrls || [])
		.map((url) => `- ${url}`)
		.join("\n");
	const features = (generated.keyFeatures || [])
		.map((item) => `- ${item}`)
		.join("\n");
	const specs = (generated.technicalSpecs || [])
		.map(
			(spec) =>
				`| ${escapeMarkdownTable(spec.name)} | ${escapeMarkdownTable(spec.value)} | ${escapeMarkdownTable(spec.source)} |`,
		)
		.join("\n");
	const tags = (generated.tags || []).join("\n");
	const notes = (generated.notes || []).map((note) => `- ${note}`).join("\n");

	return `# ${generated.recommendedTitle || product.title}

## Stato lavorazione

- Stato: bozza locale generata automaticamente, non ancora pubblicata su Shopify
- Generatore: \`generate-content-enrichment-with-openai.js\`
- Provider AI: \`${CONFIG.aiProvider}\`
- Modello AI: \`${CONFIG.aiProvider === "gemini" ? CONFIG.geminiModel : CONFIG.openAiModel}\`
- Richiede review umana prima della pubblicazione: sì

## Prodotto Shopify attuale

| Campo | Valore |
| --- | --- |
| Product ID | \`${product.id}\` |
| Titolo attuale | \`${escapeMarkdownTable(product.title)}\` |
| Handle attuale | \`${product.handle}\` |
| URL Shopify | ${product.onlineStoreUrl || ""} |
| Vendor attuale | \`${escapeMarkdownTable(product.vendor || "")}\` |
| SKU | \`${escapeMarkdownTable(skuList)}\` |
| Stato | \`${product.status}\` |
| Descrizione attuale | ${stripHtml(product.descriptionHtml).length ? `${stripHtml(product.descriptionHtml).length} caratteri` : "vuota"} |
| SEO title attuale | ${product.seo?.title || "vuoto"} |
| SEO description attuale | ${product.seo?.description || "vuota"} |
| Immagini attuali | ${product.images.edges.length} |

## Fonti

${sourceUrls || "- Da verificare manualmente"}

## Titolo consigliato

\`\`\`txt
${generated.recommendedTitle || product.title}
\`\`\`

## Handle consigliato

\`\`\`txt
${generated.recommendedHandle || product.handle}
\`\`\`

## Descrizione commerciale in italiano

${generated.commercialDescriptionMarkdown || ""}

## Descrizione Shopify HTML

\`\`\`html
${generated.descriptionHtml || ""}
\`\`\`

## Caratteristiche principali

${features}

## Scheda tecnica strutturata

| Campo | Valore | Fonte / note |
| --- | --- | --- |
${specs}

## SEO title

\`\`\`txt
${generated.seoTitle || ""}
\`\`\`

## SEO meta description

\`\`\`txt
${generated.seoDescription || ""}
\`\`\`

## Product type consigliato

\`\`\`txt
${generated.productType || ""}
\`\`\`

## Vendor consigliato

\`\`\`txt
${generated.vendor || product.vendor || ""}
\`\`\`

## Tag consigliati

\`\`\`txt
${tags}
\`\`\`

## Immagini locali

| File locale | Uso consigliato | Alt text consigliato | Fonte |
| --- | --- | --- | --- |
${imageRows || ""}

## Note generazione

${notes || "- Nessuna nota."}

## Checklist prima della pubblicazione

- [ ] Validare descrizione commerciale
- [ ] Validare scheda tecnica contro fonti ufficiali
- [ ] Confermare diritto d’uso immagini
- [ ] Controllare qualità e dimensione immagini
- [ ] Pubblicare con \`CONFIRM_WRITE=true PRODUCT_DIR=${path.join(CONFIG.outputDir, slugify(generated.recommendedTitle || product.handle))} npm run upload-content-enrichment\`
`;
}

async function main() {
	try {
		log("=== Generate Content Enrichment With OpenAI ===", "INFO");
		log(`Mode: local generation only, no Shopify writes`, "INFO");
		log(`AI provider: ${CONFIG.aiProvider}`, "INFO");
		log(
			`AI URL: ${CONFIG.aiProvider === "gemini" ? CONFIG.geminiApiUrl : CONFIG.openAiApiUrl}`,
			"INFO",
		);
		log(
			`AI model: ${CONFIG.aiProvider === "gemini" ? CONFIG.geminiModel : CONFIG.openAiModel}`,
			"INFO",
		);
		log(
			`Product query: ${CONFIG.productHandle || CONFIG.productQuery}`,
			"INFO",
		);

		if (!CONFIG.shopifyStore || !CONFIG.shopifyAccessToken) {
			throw new Error("Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN");
		}
		if (
			CONFIG.aiProvider === "openai" &&
			(!CONFIG.openAiApiKey || !CONFIG.openAiApiUrl)
		) {
			throw new Error("Missing OPENAI_API_KEY or OPENAI_API_URL");
		}
		if (
			CONFIG.aiProvider === "gemini" &&
			(!CONFIG.geminiApiKey || !CONFIG.geminiApiUrl)
		) {
			throw new Error("Missing GEMINI_API_KEY or GEMINI_API_URL");
		}

		const product = await findFirstContentlessProduct();
		log(`Selected product: ${product.title} (${product.handle})`, "SUCCESS");

		const generated = await callAi(product);
		const folderName = slugify(generated.recommendedTitle || product.handle);
		const productDir = path.join(CONFIG.outputDir, folderName);
		fs.mkdirSync(productDir, { recursive: true });

		fs.writeFileSync(
			path.join(productDir, "generation.json"),
			`${JSON.stringify(generated, null, 2)}\n`,
		);

		const downloadedImages = CONFIG.downloadImages
			? await downloadGeneratedImages(generated, productDir)
			: [];
		const markdown = buildMarkdown({ product, generated, downloadedImages });
		fs.writeFileSync(path.join(productDir, "content.md"), markdown);

		log(`Wrote: ${path.join(productDir, "content.md")}`, "SUCCESS");
		log(`Wrote: ${path.join(productDir, "generation.json")}`, "INFO");
		log(`Downloaded images: ${downloadedImages.length}`, "INFO");
		log("Next dry-run command:", "INFO");
		log(`PRODUCT_DIR=${productDir} npm run upload-content-enrichment`, "INFO");
		log("Next publish command, after review:", "WARN");
		log(
			`PRODUCT_DIR=${productDir} CONFIRM_WRITE=true npm run upload-content-enrichment`,
			"WARN",
		);
		log(`Log file: ${logger.getLogFile()}`, "INFO");
	} catch (error) {
		log(`Fatal error: ${error.message}`, "ERROR");
		console.error(error);
		process.exit(1);
	}
}

main();
