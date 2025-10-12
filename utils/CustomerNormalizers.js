/**
 * Customer normalizers for Magento to Shopify migration
 * Contains all customer data normalization and transformation functions
 */

export default class CustomerNormalizers {
  constructor(config, logger, customerData) {
    this.config = config;
    this.log = logger;
    this.customerData = customerData;
  }

  // Clean and format phone number
  cleanPhoneNumber(phone) {
    if (!phone || phone.trim() === '' || phone.trim() === ' ') return null;
    
    // Remove common prefixes and clean the number
    let cleaned = phone.toString().trim();
    
    // Remove quotes and extra spaces
    cleaned = cleaned.replace(/["\\s]/g, '');
    
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

  // Country mapping for addresses
  getCountryMap() {
    return {
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
  }

  // Extract city from address string (heuristic approach)
  extractCityFromAddress(addressString) {
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

  // Parse address from combined address string and additional fields
  parseAddress(addressString, customerData) {
    if (!addressString || addressString.trim() === '') return null;

    // Split the address string - format appears to be "Street City Province ZIP"
    const parts = addressString.trim().split(' ');
    if (parts.length < 2) return null;

    // Try to extract components
    const zipMatch = addressString.match(/\b\d{5}\b/); // 5-digit ZIP code
    const zip = zipMatch ? zipMatch[0] : customerData.ZIP;

    // Country mapping
    const countryMap = this.getCountryMap();
    const country = countryMap[customerData.Paese] || customerData.Paese;
    const province = customerData['State/Province'];

    // Extract street address (remove city, province, zip from the end)
    let address1 = addressString;
    if (zip) {
      address1 = address1.replace(new RegExp(`\\s*${zip}\\s*$`), '');
    }
    
    // Try to extract city from the Via field or guess from address
    const city = customerData['Città'] || this.extractCityFromAddress(addressString);
    
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

  // Check if two addresses are equal
  addressesEqual(addr1, addr2) {
    if (!addr1 || !addr2) return false;
    
    return addr1.address1 === addr2.address1 &&
           addr1.city === addr2.city &&
           addr1.province === addr2.province &&
           addr1.zip === addr2.zip &&
           addr1.country === addr2.country;
  }

  // Generate tags for customer based on data
  generateCustomerTags() {
    const tags = [];
    const customerData = this.customerData;
    
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
  generateCustomerNote() {
    const notes = [];
    const customerData = this.customerData;
    
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

  // Main normalization function - converts Magento customer data to Shopify format
  normalizeCustomerData() {
    const customerData = this.customerData;
    
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
    const phone = customerData.Phone ? this.cleanPhoneNumber(customerData.Phone) : null;

    // Parse addresses
    const billingAddress = this.parseAddress(customerData['Domicilio fiscale'], customerData);
    const shippingAddress = this.parseAddress(customerData['Indirizzo per la spedizione'], customerData);

    // Create base customer object
    const customerInput = {
      email: customerData.Email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone
    };

    // Add addresses if available
    const addresses = [];
    
    if (billingAddress) {
      addresses.push(billingAddress);
    }
    
    if (shippingAddress && !this.addressesEqual(billingAddress, shippingAddress)) {
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
    const tags = this.generateCustomerTags();
    if (tags.length > 0) {
      customerInput.tags = tags;
    }

    // Add note with additional customer information
    const note = this.generateCustomerNote();
    if (note) {
      customerInput.note = note;
    }

    return customerInput;
  }
}