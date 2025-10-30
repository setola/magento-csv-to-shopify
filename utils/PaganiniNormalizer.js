/**
 * Paganini CSV Data Normalizer
 * Handles transformation of Paganini CSV data to Shopify format
 */

export default class PaganiniNormalizer {
  constructor(config, logger, productData) {
    this.config = config;
    this.log = logger;
    this.productData = productData;
  }

  /**
   * Check if product should be imported (only LEUPOLD vendor)
   * @returns {boolean} True if product should be imported
   */
  shouldImport() {
    const vendor = this.productData.Produttore;
    if (!vendor || vendor.toString().trim().toUpperCase() !== 'LEUPOLD') {
      return false;
    }
    return true;
  }

  /**
   * Generate SKU from vendor and product code
   * Format: [First 3 letters of vendor].[Product code]
   * Example: LEU.90011
   * @returns {string} Generated SKU
   */
  generateSKU() {
    const vendor = (this.productData.Produttore || '').toString().trim();
    const productCode = (this.productData.Codice_Produttore || '').toString().trim();
    
    if (!vendor || !productCode) {
      this.log(`Warning: Missing vendor or product code for SKU generation`, 'WARN');
      return null;
    }
    
    // Take first 3 letters of vendor, uppercase
    const vendorPrefix = vendor.substring(0, 3).toUpperCase();
    
    return `${vendorPrefix}.${productCode}`;
  }

  /**
   * Normalize product title
   * Lowercase the entire string, then capitalize only first letter
   * @returns {string} Normalized title
   */
  normalizeTitle() {
    const title = (this.productData.Anagrafica_Paganini || '').toString().trim();
    
    if (!title) {
      this.log(`Warning: Empty title`, 'WARN');
      return 'Untitled Product';
    }
    
    // Lowercase everything
    const lowercased = title.toLowerCase();
    
    // Capitalize only the first character
    return lowercased.charAt(0).toUpperCase() + lowercased.slice(1);
  }

  /**
   * Normalize product description
   * Strip HTML tags and handle <br> tags by replacing with spaces
   * @returns {string} Normalized description
   */
  normalizeDescription() {
    let description = (this.productData.Descrittivo_Paganini || '').toString().trim();
    
    if (!description) {
      return '';
    }
    
    // Replace <br> and <br/> and <br /> with space to avoid word concatenation
    description = description.replace(/<br\s*\/?>/gi, ' ');
    
    // Remove all other HTML tags
    description = description.replace(/<[^>]*>/g, '');
    
    // Replace multiple spaces with single space
    description = description.replace(/\s+/g, ' ').trim();
    
    return description;
  }

  /**
   * Normalize price from Italian format to Shopify decimal format
   * Handles: comma as decimal separator, removes currency symbols
   * @param {string} priceInput - Raw price string
   * @returns {string|null} Normalized price in decimal format (e.g., "19.99")
   */
  normalizePrice(priceInput) {
    if (!priceInput || priceInput.toString().trim() === '') {
      return null;
    }
    
    const priceStr = priceInput.toString().trim();
    
    // Remove currency symbols and spaces
    let cleanPrice = priceStr
      .replace(/[€$£¥₹₽₴₪₦₡₵₸₻₼₾₿]/g, '')
      .replace(/\b(EUR|USD|GBP|JPY|CNY|CAD|AUD|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RUB|TRY|ILS|INR|BRL|MXN|KRW|ZAR|SGD|HKD|NZD|THB|MYR|IDR|PHP|VND)\b/gi, '')
      .replace(/\s+/g, '')
      .trim();
    
    if (cleanPrice === '') {
      return null;
    }
    
    // Handle Italian/European format: comma is decimal separator, dot is thousands separator
    if (cleanPrice.includes(',')) {
      if (cleanPrice.includes('.') && cleanPrice.includes(',')) {
        // Both present: check which comes last
        const lastCommaPos = cleanPrice.lastIndexOf(',');
        const lastDotPos = cleanPrice.lastIndexOf('.');
        
        if (lastCommaPos > lastDotPos) {
          // European format: 1.234,56 -> 1234.56
          cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
        } else {
          // American format: 1,234.56 -> 1234.56
          cleanPrice = cleanPrice.replace(/,/g, '');
        }
      } else {
        // Only comma: check if it's decimal or thousands separator
        const parts = cleanPrice.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
          // Decimal separator: 19,99 -> 19.99
          cleanPrice = cleanPrice.replace(',', '.');
        } else {
          // Thousands separator: 1,234 -> 1234
          cleanPrice = cleanPrice.replace(/,/g, '');
        }
      }
    }
    
    // Handle multiple dots (thousands separators)
    const dotCount = (cleanPrice.match(/\./g) || []).length;
    if (dotCount > 1) {
      const parts = cleanPrice.split('.');
      if (parts.length > 2 && parts[parts.length - 1].length <= 2) {
        // Keep last dot as decimal: 1.234.56 -> 1234.56
        const lastPart = parts.pop();
        cleanPrice = parts.join('') + '.' + lastPart;
      } else {
        // Remove all dots: 1.234.567 -> 1234567
        cleanPrice = cleanPrice.replace(/\./g, '');
      }
    }
    
    // Convert to number and validate
    const numericPrice = parseFloat(cleanPrice);
    
    if (isNaN(numericPrice) || numericPrice < 0) {
      this.log(`Warning: Invalid price value "${priceStr}" could not be normalized`, 'WARN');
      return null;
    }
    
    // Return Shopify decimal format with 2 decimals
    return numericPrice.toFixed(2);
  }

  /**
   * Normalize product availability to inventory quantity
   * A -> 1, B -> 4, C -> 10, others -> 0
   * @returns {number} Inventory quantity
   */
  normalizeAvailability() {
    const availability = (this.productData.Disponibilita || '').toString().trim().toUpperCase();
    
    switch (availability) {
      case 'A':
        return 1;
      case 'B':
        return 4;
      case 'C':
        return 10;
      default:
        return 0;
    }
  }

  /**
   * Get vendor name
   * @returns {string} Vendor name
   */
  getVendor() {
    return (this.productData.Produttore || '').toString().trim();
  }

  /**
   * Get cost from Prezzo column
   * @returns {string|null} Normalized cost
   */
  getCost() {
    return this.normalizePrice(this.productData.Prezzo);
  }

  /**
   * Get price from Prezzo_pubblico column
   * @returns {string|null} Normalized price
   */
  getPrice() {
    return this.normalizePrice(this.productData.Prezzo_pubblico);
  }

  /**
   * Determine product status based on availability
   * @returns {string} 'ACTIVE' or 'DRAFT'
   */
  getProductStatus() {
    const quantity = this.normalizeAvailability();
    return quantity > 0 ? 'ACTIVE' : 'DRAFT';
  }

  /**
   * Build complete product data for Shopify
   * @returns {Object} Product data ready for Shopify API
   */
  buildProductData() {
    const sku = this.generateSKU();
    const title = this.normalizeTitle();
    const description = this.normalizeDescription();
    const vendor = this.getVendor();
    const cost = this.getCost();
    const price = this.getPrice();
    const quantity = this.normalizeAvailability();
    const status = this.getProductStatus();

    if (!sku) {
      throw new Error('Cannot build product data: SKU generation failed');
    }

    if (!price) {
      throw new Error('Cannot build product data: Price is required');
    }

    return {
      sku,
      title,
      description,
      vendor,
      cost,
      price,
      quantity,
      status,
      // Additional raw data for reference
      rawData: {
        upc: this.productData.UPC || '',
        paganiniCode: this.productData.Codice_Paganini || '',
        manufacturerCode: this.productData.Codice_Produttore || '',
        packQuantity: this.productData.Confezione_acquisto || '',
        arrivalDate: this.productData.Data_Arrivo || ''
      }
    };
  }
}
