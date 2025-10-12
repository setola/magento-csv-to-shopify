/**
 * Customer validation utilities for Magento to Shopify migration
 * Contains all customer data validation functions
 */

export default class CustomerValidators {
  constructor(logger) {
    this.log = logger;
  }

  // Validate customer email
  validateEmail(email) {
    if (!email || email.trim() === '') {
      return { valid: false, reason: 'Missing email' };
    }

    const cleanEmail = email.trim();
    
    // Check for basic email format and blacklisted domains
    if (!cleanEmail.includes('@') || cleanEmail.includes('nomail') || cleanEmail.includes('nessrls.it')) {
      return { valid: false, reason: `Invalid email (${cleanEmail})` };
    }

    return { valid: true, email: cleanEmail };
  }

  // Validate shipping address
  validateShippingAddress(customerData) {
    const shippingAddressString = customerData['Indirizzo per la spedizione'];
    
    if (!shippingAddressString || shippingAddressString.trim() === '') {
      return { valid: false, reason: 'Missing shipping address' };
    }

    return { valid: true };
  }

  // Validate required customer fields
  validateRequiredFields(customerData) {
    const validations = [
      this.validateEmail(customerData.Email),
      this.validateShippingAddress(customerData)
    ];

    const failures = validations.filter(v => !v.valid);
    
    if (failures.length > 0) {
      return { valid: false, reason: failures[0].reason };
    }

    return { valid: true, email: validations[0].email };
  }
}