/**
 * Shopify GraphQL Client
 * Handles all interactions with Shopify GraphQL API including rate limiting
 */

export default class ShopifyClient {
  constructor(config, logger) {
    this.config = config;
    this.log = logger;
    this.baseUrl = `https://${config.shopifyStore}/admin/api/2024-10/graphql.json`;
  }

  // Main GraphQL client method
  async query(query, variables = {}) {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.config.shopifyAccessToken
        },
        body: JSON.stringify({ query, variables })
      });

      const result = await response.json();
      
      // Handle rate limiting
      const cost = result.extensions?.cost;
      if (cost) {
        this.log(`GraphQL Cost: ${cost.actualQueryCost}/${cost.throttleStatus.currentlyAvailable}`, 'DEBUG');
        
        // If we're approaching the limit, wait
        if (cost.throttleStatus.currentlyAvailable < 100) {
          const waitTime = 2000;
          this.log(`Rate limit approaching, waiting ${waitTime}ms`, 'WARN');
          await this.delay(waitTime);
        }
      }

      if (result.errors) {
        throw new Error(JSON.stringify(result.errors));
      }

      return result.data;
    } catch (error) {
      this.log(`GraphQL Error: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  // Utility method for delays
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Find customer by email
  async findCustomerByEmail(email) {
    const query = `
      query findCustomerByEmail($query: String!) {
        customers(first: 1, query: $query) {
          edges {
            node {
              id
              email
              firstName
              lastName
              phone
              tags
            }
          }
        }
      }
    `;

    try {
      const result = await this.query(query, { 
        query: `email:${email}` 
      });

      const edges = result.customers?.edges || [];
      if (edges.length > 0) {
        return edges[0].node;
      }
      return null;
    } catch (error) {
      this.log(`Error searching for customer ${email}: ${error.message}`, 'WARN');
      return null;
    }
  }

  // Create customer on Shopify
  async createCustomer(customerData) {
    const mutation = `
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            email
            firstName
            lastName
            phone
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const result = await this.query(mutation, { input: customerData });

      if (result.customerCreate?.userErrors?.length > 0) {
        throw new Error(JSON.stringify(result.customerCreate.userErrors));
      }

      return result.customerCreate.customer;
    } catch (error) {
      this.log(`Failed to create customer ${customerData.email}: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  // Update customer on Shopify
  async updateCustomer(customerId, customerData) {
    const mutation = `
      mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
            email
            firstName
            lastName
            phone
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const input = {
      id: customerId,
      ...customerData
    };

    try {
      const result = await this.query(mutation, { input });

      if (result.customerUpdate?.userErrors?.length > 0) {
        throw new Error(JSON.stringify(result.customerUpdate.userErrors));
      }

      return result.customerUpdate.customer;
    } catch (error) {
      this.log(`Failed to update customer ${customerId}: ${error.message}`, 'ERROR');
      throw error;
    }
  }

  // Find product by SKU (moved from product-migrate.js)
  async findProductBySku(sku) {
    const query = `
      query findProductBySku($query: String!) {
        products(first: 1, query: $query) {
          edges {
            node {
              id
              title
              handle
              variants(first: 1) {
                edges {
                  node {
                    id
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const result = await this.query(query, { 
        query: `sku:${sku}` 
      });

      const edges = result.products?.edges || [];
      if (edges.length > 0) {
        return edges[0].node;
      }
      return null;
    } catch (error) {
      this.log(`Error searching for SKU ${sku}: ${error.message}`, 'WARN');
      return null;
    }
  }

  // Delete product by ID
  async deleteProductById(productId) {
    const mutation = `
      mutation productDelete($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const result = await this.query(mutation, { 
        input: { id: productId }
      });

      if (result.productDelete?.userErrors?.length > 0) {
        throw new Error(JSON.stringify(result.productDelete.userErrors));
      }

      return result.productDelete.deletedProductId;
    } catch (error) {
      this.log(`Failed to delete product ${productId}: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}
