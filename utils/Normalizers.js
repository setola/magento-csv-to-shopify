/**
 * Normalizers for Magento to Shopify migration
 * Contains all data normalization and transformation functions
 */

export default class Normalizers {
  constructor(config, logger, productData) {
    this.config = config;
    this.log = logger;
    this.productData = productData;
  }

  // Normalizza status da Magento
  normalizeProductStatus() {
    const productOnline = this.productData.product_online;
    if (!productOnline) return 'DRAFT';
    
    // Se è un numero, controlla se > 0
    const numValue = parseInt(productOnline);
    if (!isNaN(numValue)) {
      return numValue > 0 ? 'ACTIVE' : 'DRAFT';
    }
    
    // Se è stringa, controlla valori comuni
    const strValue = productOnline.toString().toLowerCase().trim();
    if (strValue === '1' || strValue === 'true' || strValue === 'yes' || strValue === 'active') {
      return 'ACTIVE';
    }
    
    return 'DRAFT';
  }

  // Normalizza country of manufacture in ISO 3166-1 alpha-2 code
  normalizeCountryOfManufacture() {
    const countryInput = this.productData.country_of_manufacture;
    if (!countryInput || countryInput.trim() === '') return null;
    
    const country = countryInput.toString().trim();
    
    // Se è già un codice a 2 lettere, ritorna uppercase
    if (country.length === 2 && /^[A-Za-z]{2}$/.test(country)) {
      return country.toUpperCase();
    }
    
    // Mapping paese → codice ISO 3166-1 alpha-2
    const countryMap = {
      // Common countries
      'italy': 'IT',
      'italia': 'IT',
      'united states': 'US',
      'usa': 'US',
      'stati uniti': 'US',
      'america': 'US',
      'germany': 'DE',
      'germania': 'DE',
      'deutschland': 'DE',
      'austria': 'AT',
      'österreich': 'AT',
      'switzerland': 'CH',
      'svizzera': 'CH',
      'schweiz': 'CH',
      'france': 'FR',
      'francia': 'FR',
      'spain': 'ES',
      'spagna': 'ES',
      'españa': 'ES',
      'united kingdom': 'GB',
      'uk': 'GB',
      'regno unito': 'GB',
      'great britain': 'GB',
      'canada': 'CA',
      'japan': 'JP',
      'giappone': 'JP',
      'china': 'CN',
      'cina': 'CN',
      'taiwan': 'TW',
      'south korea': 'KR',
      'korea': 'KR',
      'corea': 'KR',
      'brazil': 'BR',
      'brasile': 'BR',
      'australia': 'AU',
      'russia': 'RU',
      'russia federation': 'RU',
      'poland': 'PL',
      'polonia': 'PL',
      'czech republic': 'CZ',
      'repubblica ceca': 'CZ',
      'cechia': 'CZ',
      'turkey': 'TR',
      'turchia': 'TR',
      'israel': 'IL',
      'israele': 'IL',
      'finland': 'FI',
      'finlandia': 'FI',
      'sweden': 'SE',
      'svezia': 'SE',
      'norway': 'NO',
      'norvegia': 'NO',
      'denmark': 'DK',
      'danimarca': 'DK',
      'belgium': 'BE',
      'belgio': 'BE',
      'netherlands': 'NL',
      'olanda': 'NL',
      'paesi bassi': 'NL',
      'isola bouvet': 'BV',
      'slovacchia': 'SK',
      'bulgaria': 'BG',
      'sahara occidentale': 'EH',
      'islanda': 'IS',
      'lituania': 'LT',
      'uruguay': 'UY',
      'croazia': 'HR',
      'samoa': 'WS',
      'estonia': 'EE',
      'cuba': 'CU',
      'grecia': 'GR',
      'ecuador': 'EC',
      'città del vaticano': 'VA',
      'vaticano': 'VA',
      'isola christmas': 'CX',
      'sri lanka': 'LK',
      'samoa americane': 'AS',
      'sudafrica': 'ZA',
      'south africa': 'ZA',
      'saint kitts e nevis': 'KN',
      'saint-pierre e miquelon': 'PM',
      'vietnam': 'VN',
      'macedonia del nord': 'MK',
      'north macedonia': 'MK',
      'saint-barthélemy': 'BL',
      'saint vincent e grenadine': 'VC',
      'romania': 'RO',
      'bielorussia': 'BY',
      'belarus': 'BY',
      'slovenia': 'SI',
      'serbia': 'RS',
      'filippine': 'PH',
      'philippines': 'PH'
    };
    
    const normalizedInput = country.toLowerCase();
    
    if (countryMap[normalizedInput]) {
      return countryMap[normalizedInput];
    }
    
    // Se non trovato nella mappa, prova a cercare per substring
    for (const [countryName, code] of Object.entries(countryMap)) {
      if (normalizedInput.includes(countryName) || countryName.includes(normalizedInput)) {
        return code;
      }
    }
    
    // Se non trovato, ritorna null e logga un warning
    this.log(`Warning: Unknown country of manufacture: "${country}". Please add to country mapping.`, 'WARN');
    return null;
  }

  // Normalizza tags/categorie Magento per Shopify
  normalizeProductTags() {
    const categoriesInput = this.productData.categories;
    if (!categoriesInput || categoriesInput.trim() === '') return [];
    
    const categories = categoriesInput.toString().trim();
    
    // Split per virgola per ottenere tutti i path delle categorie
    const categoryPaths = categories.split(',').map(path => path.trim());
    
    // Set per evitare duplicati
    const uniqueTags = new Set();
    
    categoryPaths.forEach(path => {
      if (!path) return;
      
      // Handle escaped forward slashes and split per '/' per ottenere i segmenti
      // First, temporarily replace escaped slashes to avoid splitting on them
      const tempPath = path.replace(/\\\//g, '___ESCAPED_SLASH___');
      const segments = tempPath
        .split('/')
        .map(segment => segment.trim())
        .map(segment => segment.replace(/___ESCAPED_SLASH___/g, ' & ')) // Convert \/ to " & "
        .filter(segment => segment && segment !== 'Root'); // Rimuovi vuoti e "Root"
      
      // Aggiungi ogni segmento al set (evita duplicati automaticamente)
      segments.forEach(segment => {
        if (segment) {
          uniqueTags.add(segment);
        }
      });
    });
    
    // Converti il set in array e ordina alfabeticamente
    return Array.from(uniqueTags).sort();
  }

  // Mappa categorie Magento a Shopify Standard Product Taxonomy
  // Input: array di tag normalizzati (output di normalizeProductTags)
  // Returns: { taxonomy: string, matchedTag: string } or null
  mapCategoryToShopifyTaxonomy(normalizedTags = null) {
    // Use provided tags or get from productData
    const tags = normalizedTags || this.normalizeProductTags();
    
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return null;
    }
    
    // Mapping per singoli tag (dal più specifico al più generale)
    // Using actual Shopify taxonomy IDs from their official taxonomy
    const tagMappings = {
      // Firearms parts by brand (most specific) - all map to Hunting & Shooting
      'glock': 'sg-4-9',
      'beretta': 'sg-4-9',
      'sig sauer': 'sg-4-9',
      'cz': 'sg-4-9',
      'tanfoglio': 'sg-4-9',
      '1911': 'sg-4-9',
      '2011': 'sg-4-9',
      'ak': 'sg-4-9',
      'ar15': 'sg-4-9',
      'ar10': 'sg-4-9',
      'ar9': 'sg-4-9',
      'pcc': 'sg-4-9',
      
      // Specific equipment types - all map to Hunting & Shooting
      'scatti': 'sg-4-9',
      'caricatori': 'sg-4-9',
      'bipiedi': 'sg-4-9-6-2',
      'monopod': 'sg-4-9-6-2',
      'handguards': 'ma-2-1-6',
      'impugnature': 'ma-2-1-6',
      'muzzle brakes': 'sg-4-9',
      'flash hiders': 'sg-4-9',
      'calci': 'sg-4-9',
      'chassis': 'ma-2-1-9',
      'guancette': 'ma-2-1-6',
      
      // Optics (specific types) - map to Hunting & Shooting
      'cannocchiali': 'sg-4-9',
      'red dot': 'sg-4-9',
      'holosight': 'sg-4-9',
      'binocoli': 'sg-4-9',
      'telemetri': 'sg-4-9',
      'visori notturni': 'sg-4-9',
      'laser': 'sg-4-9',
      'moltiplicatori': 'sg-4-9',
      
      
      // Reloading supplies (specific types) - all map to Hunting & Shooting
      'presse': 'ma-2-1-3',
      'bilance': 'ma-2-1-3',
      'dies': 'ma-2-1-3',
      'matrici': 'ma-2-1-3',
      'palle': 'ma-2-1-3',
      'ogive': 'ma-2-1-3',
      'bossoli': 'ma-2-1-3',
      'inneschi': 'ma-2-1-3',
      'innescatori': 'ma-2-1-3',
      'cronografi': 'ma-2-1-3',
      'martelli cinetici': 'ma-2-1-3',
      
      // Shooting accessories (specific types) - map to specific subcategories
      'bersagli': 'sg-4-9-6-3', // Sporting Goods > Outdoor Recreation > Hunting & Shooting > Shooting & Range Accessories > Shooting Targets
      'timer': 'sg-4-9',
      'crono': 'sg-4-9',
      'protezione udito': 'sg-4-9-4',
      'treppiedi': 'sg-4-9-6-2',
      
      // Bags and cases - use weapon-specific categories
      'borse': 'ma-2-1-4', // Mature > Weapons & Weapon Accessories > Weapon Care & Accessories > Weapon Cases & Range Bags
      'zaini': 'ma-2-1-4',
      'hardcase': 'ma-2-1-4',
      
      // Clothing - use found IDs
      'abbigliamento': 'aa-1', // Apparel & Accessories > Clothing
      'cappelli': 'aa-2-17', // Apparel & Accessories > Clothing Accessories > Hats
      'vestiario': 'aa-1',
      
      // Holsters and tactical gear - map to Hunting & Shooting
      'buffetteria': 'ma-2-1-7',
      'fondine': 'ma-2-1-7',
      'cinture': 'aa-2-6', // Apparel & Accessories > Clothing Accessories > Belts
      'portacaricatori': 'ma-2-1-7',
      'magneti': 'ma-2-1-7',
      
      // Lights - map to Hardware > Tools
      'torce': 'ha-15', // Hardware > Tools
      'led': 'ha-15',
      'luci da testa': 'ha-15',
      'lanterne': 'ha-15',
      
      // Tools (specific types) - map to Hardware > Tools
      'calibri': 'ha-15',
      'chiavi': 'ha-15',
      'bacchette': 'sg-4-9', // cleaning supplies for firearms
      'scovoli': 'ma-2-1-5-1',
      'spazzole': 'ma-2-1-5-1',
      
      // Self defense - map appropriately
      'coltelli': 'ha-15', // Hardware > Tools (knives are tools)
      'spray anti aggressione': 'sg-4-9',
      'penne tattiche': 'ha-15',
      
      // General categories (broader)
      'parti': 'sg-4-9', // firearm parts
      'accessori armi': 'sg-4-9',
      'ottiche': 'sg-4-9', // optics for firearms
      'ricarica': 'sg-4-9', // reloading supplies
      'pulizia': 'ma-2-1', // cleaning supplies for firearms
      'attrezzature': 'sg-4-9', // equipment for shooting
      'utensili': 'ha-15', // tools
      'luci': 'ha-15', // lights
      'aria compressa': 'sg-4-9-8-3', // airguns
      'self defense': 'sg-4-9'
    };
    
    // Cerca il match più specifico (partendo dal più specifico al più generale)
    // Prima cerca i tag che hanno mapping più specifici (con taxonomy ID più lungo/specifico)
    // Poi per lunghezza del tag stesso
    
    // Define specificity levels based on taxonomy depth
    const getSpecificityScore = (taxonomy) => {
      if (!taxonomy) return 0;
      // Count the depth by number of dashes (sg-4-9-6-3 is more specific than sg-4-9)
      return taxonomy.split('-').length;
    };
    
    // Sort tags by their mapping specificity first, then by tag length
    const tagWithMappings = tags
      .map(tag => ({
        tag,
        lowerTag: tag.toLowerCase(),
        mapping: tagMappings[tag.toLowerCase()]
      }))
      .filter(item => item.mapping) // Only keep tags that have mappings
      .sort((a, b) => {
        const scoreA = getSpecificityScore(a.mapping);
        const scoreB = getSpecificityScore(b.mapping);
        if (scoreA !== scoreB) {
          return scoreB - scoreA; // Higher specificity first
        }
        return b.tag.length - a.tag.length; // Longer tags first if same specificity
      });
    
    // If we found tags with mappings, use the most specific one
    if (tagWithMappings.length > 0) {
      const bestMatch = tagWithMappings[0];
      return {
        taxonomy: bestMatch.mapping,
        matchedTag: bestMatch.tag
      };
    }
    
    // Default fallback for hunting & shooting
    return {
      taxonomy: 'sg-4-9', // Sporting Goods > Outdoor Recreation > Hunting & Shooting
      matchedTag: 'default'
    };
  }

  // Normalizza attribute set code
  normalizeAttributeSetCode() {
    let attributeSetCode = this.productData.attribute_set_code || '';
    attributeSetCode = attributeSetCode.replace('_src', '').replace('_', ' ');
    return attributeSetCode || '';
  }

  // Costruisce URL completo per immagini Magento (utility function, still needs imagePath param)
  buildImageUrl(imagePath) {
    if (!imagePath || imagePath.trim() === '') return null;
    
    imagePath = imagePath.trim();
    
    // Se l'URL è già completo, ritornalo
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    
    // Se non abbiamo base URL Magento, skip
    if (!this.config.magentoBaseUrl) {
      this.log(`Warning: Image path "${imagePath}" is relative but MAGENTO_BASE_URL not configured`, 'WARN');
      return null;
    }
    
    // Rimuovi slash iniziale se presente
    if (imagePath.startsWith('/')) {
      imagePath = imagePath.substring(1);
    }
    
    // Costruisci URL completo
    const baseUrl = this.config.magentoBaseUrl.replace(/\/$/, ''); // Rimuovi trailing slash
    const mediaPath = this.config.magentoMediaPath.replace(/\/$/, '');
    
    return `${baseUrl}${mediaPath}/${imagePath}`;
  }

  // Normalizza prezzo da stringa Magento a formato Shopify decimal
  // Input: price string (può contenere simboli valuta, spazi, virgole)
  // Output: string in formato decimal (es. "19.99") o null se non valido
  normalizePrice(priceInput) {
    if (!priceInput || priceInput.toString().trim() === '') {
      return null;
    }
    
    const priceStr = priceInput.toString().trim();
    
    // Rimuovi simboli di valuta comuni e spazi
    // Supporta: €, $, £, ¥, €, EUR, USD, GBP, etc.
    let cleanPrice = priceStr
      .replace(/[€$£¥₹₽₴₪₦₡₵₸₻₼₾₿]/g, '') // simboli di valuta
      .replace(/\b(EUR|USD|GBP|JPY|CNY|CAD|AUD|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RUB|TRY|ILS|INR|BRL|MXN|KRW|ZAR|SGD|HKD|NZD|THB|MYR|IDR|PHP|VND)\b/gi, '') // codici valuta ISO
      .replace(/\s+/g, '') // spazi
      .trim();
    
    // Se vuoto dopo pulizia, ritorna null
    if (cleanPrice === '') {
      return null;
    }
    
    // Gestisci formati con virgola come separatore decimale (formato europeo)
    // Es: "19,99" → "19.99", "1.234,56" → "1234.56"
    if (cleanPrice.includes(',')) {
      // Se ci sono sia punto che virgola, assume formato europeo (punto = migliaia, virgola = decimali)
      if (cleanPrice.includes('.') && cleanPrice.includes(',')) {
        // Verifica se è formato europeo (1.234,56) o americano (1,234.56)
        const lastCommaPos = cleanPrice.lastIndexOf(',');
        const lastDotPos = cleanPrice.lastIndexOf('.');
        
        if (lastCommaPos > lastDotPos) {
          // Formato europeo: rimuovi punti (migliaia) e converti virgola in punto (decimali)
          cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
        } else {
          // Formato americano: rimuovi virgole (migliaia)
          cleanPrice = cleanPrice.replace(/,/g, '');
        }
      } else {
        // Solo virgola presente
        // Se ci sono 3 o più cifre dopo la virgola, probabilmente è separatore migliaia
        // Se ci sono 1-2 cifre, probabilmente è separatore decimale
        const parts = cleanPrice.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
          // Probabilmente decimale: "19,99" → "19.99"
          cleanPrice = cleanPrice.replace(',', '.');
        } else {
          // Probabilmente migliaia: "1,234" → "1234"
          cleanPrice = cleanPrice.replace(/,/g, '');
        }
      }
    }
    
    // Rimuovi eventuali punti extra se sono separatori di migliaia
    // Es: "1.234.567.89" dovrebbe diventare "1234567.89"
    const dotCount = (cleanPrice.match(/\./g) || []).length;
    if (dotCount > 1) {
      // Mantieni solo l'ultimo punto se ha 1-2 cifre dopo (probabilmente decimali)
      const parts = cleanPrice.split('.');
      if (parts.length > 2 && parts[parts.length - 1].length <= 2) {
        const lastPart = parts.pop();
        cleanPrice = parts.join('') + '.' + lastPart;
      } else {
        // Rimuovi tutti i punti se non sembrano separatori decimali
        cleanPrice = cleanPrice.replace(/\./g, '');
      }
    }
    
    // Converti a numero e valida
    const numericPrice = parseFloat(cleanPrice);
    
    if (isNaN(numericPrice) || numericPrice < 0) {
      this.log(`Warning: Invalid price value "${priceStr}" could not be normalized`, 'WARN');
      return null;
    }
    
    // Ritorna formato Shopify decimal con 2 decimali
    return numericPrice.toFixed(2);
  }

  // Determina il prezzo corretto e compareAtPrice basandosi su price e special_price
  // Logica: se special_price esiste ed è minore di price, allora special_price diventa il prezzo principale
  // e price diventa compareAtPrice ("era" prezzo)
  // Returns: { price: string, compareAtPrice: string|null }
  determinePricing() {
    const basePrice = this.normalizePrice(this.productData.price);
    const specialPrice = this.normalizePrice(this.productData.special_price);
    
    // Se non abbiamo un prezzo base, usa 0
    if (!basePrice) {
      this.log(`Warning: No base price found for product, using 0.00`, 'WARN');
      return {
        price: '0.00',
        compareAtPrice: null
      };
    }
    
    // Se non c'è special_price, usa solo il prezzo base
    if (!specialPrice) {
      return {
        price: basePrice,
        compareAtPrice: null
      };
    }
    
    const basePriceNum = parseFloat(basePrice);
    const specialPriceNum = parseFloat(specialPrice);
    
    // Se special_price è minore del prezzo base, è un vero sconto
    if (specialPriceNum < basePriceNum) {
      this.log(`  ↳ Special price ${specialPrice} < base price ${basePrice}, applying discount`, 'DEBUG');
      return {
        price: specialPrice,        // Il prezzo scontato diventa il prezzo principale
        compareAtPrice: basePrice   // Il prezzo originale diventa "era"
      };
    } else {
      // Se special_price è uguale o maggiore del prezzo base, ignora special_price
      this.log(`  ↳ Special price ${specialPrice} >= base price ${basePrice}, ignoring special price`, 'DEBUG');
      return {
        price: basePrice,
        compareAtPrice: null
      };
    }
  }

  // Normalizza e deduplica immagini da dati prodotto Magento
  // Ritorna array di oggetti { originalSource: string, alt: string, mediaContentType: string }
  normalizeImages() {
    const mediaInputs = [];
    const imageUrlSet = new Set(); // Track unique image URLs to avoid duplicates
    
    // Helper function to add unique images
    const addUniqueImage = (imagePath, altText) => {
      if (!imagePath || imagePath.trim() === '') return;
      
      const imageUrl = this.buildImageUrl(imagePath.trim());
      if (imageUrl && !imageUrlSet.has(imageUrl)) {
        imageUrlSet.add(imageUrl);
        mediaInputs.push({
          originalSource: imageUrl,
          alt: altText || this.productData.name || 'Product image',
          mediaContentType: 'IMAGE'
        });
      }
    };
    
    // Add images in order of priority: base, small, thumbnail, then additional
    addUniqueImage(this.productData.base_image, this.productData.base_image_label);
    addUniqueImage(this.productData.small_image, this.productData.small_image_label);
    addUniqueImage(this.productData.thumbnail_image, this.productData.thumbnail_image_label);
    
    // Add additional images
    if (this.productData.additional_images) {
      const additionalUrls = this.productData.additional_images.split(',');
      const additionalLabels = (this.productData.additional_image_labels || '').split(',');
      additionalUrls.forEach((url, idx) => {
        addUniqueImage(url, additionalLabels[idx]?.trim());
      });
    }
    
    return mediaInputs;
  }
}