// customer-migrate.js
import fs from 'fs';
import dotenv from 'dotenv';

// Import utilities
import Logger from './utils/Logger.js';
import TimeTracker from './utils/TimeTracker.js';
import ShopifyClient from './utils/ShopifyClient.js';
import CSVParser from './utils/CSVParser.js';
import RateLimiter from './utils/RateLimiter.js';

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

// Logger wrapper function to maintain compatibility
function log(message, type = 'INFO') {
  logger.log(message, type);
}

// Initialize utilities
const shopifyClient = new ShopifyClient(CONFIG, log);
const csvParser = new CSVParser(log);
const rateLimiter = new RateLimiter(CONFIG, log);

// Normalize customer data from Magento to Shopify format
function normalizeCustomerData(customerData) {
  // Extract first and last names from the "Name" field or use separate fields
  let firstName = customerData['Billing Firstname'] || '';
  let lastName = customerData['Billing Lastname'] || '';
  
  // If no billing name, try to split the "Name" field
  if (!firstName && !lastName && customerData.Name) {
    const nameParts = customerData.Name.split(' ');
    firstName = nameParts[0] || '';
    lastName = nameParts.slice(1).join(' ') || '';
  }

  // Clean phone number
  const phone = customerData.Phone ? cleanPhoneNumber(customerData.Phone) : null;

  // Parse addresses
  const billingAddress = parseAddress(customerData['Domicilio fiscale'], customerData);
  const shippingAddress = parseAddress(customerData['Indirizzo per la spedizione'], customerData);

  // Create base customer object
  const customerInput = {
    email: customerData.Email,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: phone
  };

  // Add addresses if available
  const addresses = [];
  
  if (billingAddress) {
    addresses.push({
      ...billingAddress,
      default: true // Make billing address the default
    });
  }
  
  if (shippingAddress && !addressesEqual(billingAddress, shippingAddress)) {
    addresses.push(shippingAddress);
  }

  if (addresses.length > 0) {
    customerInput.addresses = addresses;
  }

  // Add marketing consent if email is confirmed
  if (customerData['Confirmed email'] === 'Confirmed') {
    customerInput.emailMarketingConsent = {
      marketingState: 'SUBSCRIBED',
      marketingOptInLevel: 'CONFIRMED_OPT_IN'
    };
  }

  // Add tags based on customer data
  const tags = generateCustomerTags(customerData);
  if (tags.length > 0) {
    customerInput.tags = tags;
  }

  // Add note with additional customer information
  const note = generateCustomerNote(customerData);
  if (note) {
    customerInput.note = note;
  }

  return customerInput;
}

// Clean and format phone number
function cleanPhoneNumber(phone) {
  if (!phone || phone.trim() === '' || phone.trim() === ' ') return null;
  
  // Remove common prefixes and clean the number
  let cleaned = phone.toString().trim();
  
  // Remove quotes and extra spaces
  cleaned = cleaned.replace(/["\s]/g, '');
  
  // Handle Italian phone format and international formats
  if (cleaned.startsWith('00393')) {
    cleaned = '+39' + cleaned.substring(4);
  } else if (cleaned.startsWith('0039')) {
    cleaned = '+39' + cleaned.substring(4);
  } else if (cleaned.startsWith('393')) {
    cleaned = '+39' + cleaned.substring(2);
  } else if (cleaned.startsWith('333') || cleaned.startsWith('320') || cleaned.startsWith('347') || cleaned.startsWith('348')) {
    // Likely Italian mobile number missing country code
    cleaned = '+39' + cleaned;
  }
  
  return cleaned.length > 5 ? cleaned : null;
}

// Parse address from combined address string and additional fields
function parseAddress(addressString, customerData) {
  if (!addressString || addressString.trim() === '') return null;

  // Split the address string - format appears to be "Street City Province ZIP"
  const parts = addressString.trim().split(' ');
  if (parts.length < 2) return null;

  // Try to extract components
  const zipMatch = addressString.match(/\b\d{5}\b/); // 5-digit ZIP code
  const zip = zipMatch ? zipMatch[0] : customerData.ZIP;

  // Country mapping
  const countryMap = {
    'Italia': 'IT',
    'Italy': 'IT',
    'Spagna': 'ES',
    'Spain': 'ES',
    'Germania': 'DE',
    'Germany': 'DE',
    'Francia': 'FR',
    'France': 'FR',
    'Svizzera': 'CH',
    'Switzerland': 'CH',
    'Regno Unito': 'GB',
    'United Kingdom': 'GB',
    'Portogallo': 'PT',
    'Portugal': 'PT',
    'Svezia': 'SE',
    'Sweden': 'SE',
    'Slovenia': 'SI',
    'Malta': 'MT'
  };

  const country = countryMap[customerData.Paese] || customerData.Paese;
  const province = customerData['State/Province'];

  // Extract street address (remove city, province, zip from the end)
  let address1 = addressString;
  if (zip) {
    address1 = address1.replace(new RegExp(`\\s*${zip}\\s*$`), '');
  }
  
  // Try to extract city from the Via field or guess from address
  const city = customerData['Città'] || extractCityFromAddress(addressString);
  
  if (city) {
    address1 = address1.replace(new RegExp(`\\s*${city}\\s*$`, 'i'), '');
  }
  
  if (province && province !== 'Texas') { // 'Texas' seems to be a default value
    address1 = address1.replace(new RegExp(`\\s*${province}\\s*$`, 'i'), '');
  }

  return {
    address1: address1.trim(),
    city: city || '',
    province: province && province !== 'Texas' ? province : '',
    zip: zip || '',
    country: country || 'IT' // Default to Italy
  };
}

// Extract city from address string (heuristic approach)
function extractCityFromAddress(addressString) {
  // Common Italian city patterns
  const italianCities = [
    'Roma', 'Milano', 'Napoli', 'Torino', 'Palermo', 'Genova', 'Bologna', 
    'Firenze', 'Bari', 'Catania', 'Venezia', 'Verona', 'Padova', 'Trieste',
    'Brescia', 'Parma', 'Modena', 'Reggio', 'Perugia', 'Cagliari'
  ];

  for (const city of italianCities) {
    if (addressString.includes(city)) {
      return city;
    }
  }

  // Extract likely city name (capitalize first letter of each word in the latter part)
  const parts = addressString.split(' ');
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 2]; // Second to last is often the city
    return lastPart;
  }

  return '';
}

// Check if two addresses are equal
function addressesEqual(addr1, addr2) {
  if (!addr1 || !addr2) return false;
  
  return addr1.address1 === addr2.address1 &&
         addr1.city === addr2.city &&
         addr1.province === addr2.province &&
         addr1.zip === addr2.zip &&
         addr1.country === addr2.country;
}

// Generate tags for customer based on data
function generateCustomerTags(customerData) {
  const tags = [];
  
  // Add group tag
  if (customerData.Gruppo && customerData.Gruppo !== 'General' && customerData.Gruppo !== 'NOT LOGGED IN') {
    tags.push(customerData.Gruppo);
  }
  
  // Add country tag
  if (customerData.Paese && customerData.Paese !== 'Italia') {
    tags.push(`Country: ${customerData.Paese}`);
  }
  
  // Add gender tag
  if (customerData.Gender && customerData.Gender !== 'N/A') {
    tags.push(`Gender: ${customerData.Gender}`);
  }
  
  // Add company tag if exists
  if (customerData.Azienda && customerData.Azienda.trim() !== '') {
    tags.push('Business Customer');
  }
  
  // Add registration year
  if (customerData['Customer Since']) {
    const year = new Date(customerData['Customer Since']).getFullYear();
    if (!isNaN(year) && year > 2000) {
      tags.push(`Registered: ${year}`);
    }
  }
  
  return tags;
}

// Generate customer note with additional information
function generateCustomerNote(customerData) {
  const notes = [];
  
  // Add birth date if available
  if (customerData['Date of Birth'] && customerData['Date of Birth'].trim() !== '') {
    notes.push(`Date of Birth: ${customerData['Date of Birth']}`);
  }
  
  // Add VAT number if available
  if (customerData['Tax VAT Number'] && customerData['Tax VAT Number'] !== 'N/A') {
    notes.push(`VAT Number: ${customerData['Tax VAT Number']}`);
  }
  
  // Add company if available
  if (customerData.Azienda && customerData.Azienda.trim() !== '') {
    notes.push(`Company: ${customerData.Azienda}`);
  }
  
  // Add original Magento ID
  if (customerData.ID) {
    notes.push(`Original Magento ID: ${customerData.ID}`);
  }
  
  return notes.length > 0 ? notes.join(' | ') : null;
}

// Process a single customer
async function processCustomer(customerData, index) {
  try {
    // Skip customers without email
    if (!customerData.Email || customerData.Email.trim() === '') {
      log(`Skipping customer at row ${index}: Missing email`, 'WARN');
      return { skipped: true, reason: 'Missing email' };
    }

    // Skip invalid emails
    const email = customerData.Email.trim();
    if (!email.includes('@') || email.includes('nomail') || email.includes('nessrls.it')) {
      log(`Skipping customer at row ${index}: Invalid email (${email})`, 'WARN');
      return { skipped: true, reason: 'Invalid email' };
    }

    log(`Processing customer: ${email}`, 'DEBUG');
    
    // Check if customer already exists
    const existingCustomer = await shopifyClient.findCustomerByEmail(email);
    
    // Normalize customer data
    const normalizedCustomer = normalizeCustomerData(customerData);
    
    if (existingCustomer) {
      // Update existing customer
      log(`Updating existing customer: ${email}`, 'INFO');
      const updatedCustomer = await shopifyClient.updateCustomer(existingCustomer.id, normalizedCustomer);
      return { updated: true, customer: updatedCustomer };
    } else {
      // Create new customer
      log(`Creating new customer: ${email}`, 'INFO');
      const newCustomer = await shopifyClient.createCustomer(normalizedCustomer);
      return { created: true, customer: newCustomer };
    }
  } catch (error) {
    log(`Failed processing customer at row ${index}: ${error.message}`, 'ERROR');
    return { error: true, message: error.message };
  }
}

// Main migration function
async function migrateCustomers() {
  const timer = new TimeTracker();
  log('=== Starting Magento to Shopify Customer Migration ===');
  log(`Config: Start Row=${CONFIG.startRow}, Batch Size=${CONFIG.batchSize}`);

  try {
    // Parse CSV
    log('Loading customer CSV file...');
    const allCustomers = await csvParser.parseCSV(CONFIG.csvPath);
    log(`Total customers in CSV: ${allCustomers.length}`);

    // Get batch
    const batchInfo = csvParser.getBatch(allCustomers, CONFIG.startRow, CONFIG.batchSize);
    const customersToMigrate = batchInfo.batch;
    
    log(`Migrating rows ${batchInfo.startRow} to ${batchInfo.endRow} (${customersToMigrate.length} customers)`);

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
        log(`Progress: ${completed}/${total} processed | Lap: ${timingStats.lapTimeFormatted} (${timingStats.avgTimePerItem}ms/customer) | Total: ${timingStats.totalElapsedFormatted}`);
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
    
    log('=== Customer Migration Complete ===');
    log(`Total: ${stats.total}, Created: ${stats.created}, Updated: ${stats.updated}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`);
    log(`Elapsed time: ${finalElapsedFormatted} (${finalElapsedTime}ms)`);
    
    if (stats.failed > 0) {
      log('⚠ Some customers failed to migrate. Check the log for details.', 'WARN');
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
    console.error(`ERROR: Customer CSV file not found: ${CONFIG.csvPath}`);
    process.exit(1);
  }
}

// Run
validateConfig();
migrateCustomers();