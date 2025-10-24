import fs from 'fs';
import path from 'path';

/**
 * Web Authenticator utility class for handling login, cookie management, and file downloads
 */
export default class WebAuthenticator {
  constructor(logger) {
    this.logger = logger;
    this.cookies = new Map();
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  }

  /**
   * Parse cookies from Set-Cookie header
   * @param {string} cookieHeader - Set-Cookie header value
   * @returns {Object} Parsed cookie object
   */
  parseCookie(cookieHeader) {
    const cookie = {};
    const parts = cookieHeader.split(';');
    
    // Parse cookie name and value
    const [nameValue] = parts[0].split('=');
    const value = parts[0].substring(nameValue.length + 1);
    cookie.name = nameValue.trim();
    cookie.value = value.trim();
    
    // Parse attributes
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].trim();
      const [key, val] = part.split('=');
      if (key && val) {
        cookie[key.toLowerCase()] = val;
      } else if (key) {
        cookie[key.toLowerCase()] = true;
      }
    }
    
    return cookie;
  }

  /**
   * Extract cookies from response headers
   * @param {Headers} headers - Response headers
   */
  extractCookies(headers) {
    const setCookieHeaders = headers.getSetCookie ? headers.getSetCookie() : [];
    
    for (const cookieHeader of setCookieHeaders) {
      const cookie = this.parseCookie(cookieHeader);
      this.cookies.set(cookie.name, cookie);
      this.logger.debug(`Stored cookie: ${cookie.name}=${cookie.value}`);
    }
  }

  /**
   * Build cookie string for requests
   * @returns {string} Cookie string for Cookie header
   */
  buildCookieString() {
    const cookieStrings = [];
    for (const [name, cookie] of this.cookies) {
      cookieStrings.push(`${name}=${cookie.value}`);
    }
    return cookieStrings.join('; ');
  }

  /**
   * Perform login with username and password
   * @param {string} loginUrl - URL to login endpoint
   * @param {string} username - Username for authentication
   * @param {string} password - Password for authentication
   * @param {Object} formData - Additional form data to send
   * @returns {Promise<boolean>} Success status
   */
  async login(loginUrl, username, password, formData = {}) {
    try {
      this.logger.info(`Attempting login to: ${loginUrl}`);
      
      // Prepare form data
      const loginFormData = new URLSearchParams();
      
      // Get form field names from environment variables
      const usernameField = process.env.LOGIN_FORM_FIELD1 || 'username';
      const passwordField = process.env.LOGIN_FORM_FIELD2 || 'password';
      
      // Add username and password with configured field names
      loginFormData.append(usernameField, username);
      loginFormData.append(passwordField, password);
      
      // Add any additional form data
      for (const [key, value] of Object.entries(formData)) {
        loginFormData.append(key, value);
      }
      
      this.logger.debug(`Using form fields: ${usernameField}=${username}, ${passwordField}=[HIDDEN]`);

      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        body: loginFormData.toString(),
        redirect: 'manual' // Handle redirects manually to capture cookies
      });

      // Extract cookies from response
      this.extractCookies(response.headers);
      
      // Check if login was successful
      const isSuccess = response.status === 200 || response.status === 302;
      
      if (isSuccess) {
        this.logger.success('Login successful');
        return true;
      } else {
        this.logger.error(`Login failed with status: ${response.status}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Login error: ${error.message}`);
      return false;
    }
  }

  /**
   * Make authenticated GET request
   * @param {string} url - URL to request
   * @param {Object} options - Additional fetch options
   * @returns {Promise<Response>} Response object
   */
  async authenticatedGet(url, options = {}) {
    try {
      this.logger.info(`Making authenticated request to: ${url}`);
      
      const headers = {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        ...options.headers
      };

      // Add cookies if available
      const cookieString = this.buildCookieString();
      if (cookieString) {
        headers['Cookie'] = cookieString;
        this.logger.debug(`Sending cookies: ${cookieString}`);
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        ...options
      });

      // Extract any new cookies from response
      this.extractCookies(response.headers);
      
      return response;
    } catch (error) {
      this.logger.error(`Authenticated request error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download file from URL
   * @param {string} url - URL to download from
   * @param {string} outputPath - Path to save the file
   * @param {Object} options - Additional fetch options
   * @returns {Promise<boolean>} Success status
   */
  async downloadFile(url, outputPath, options = {}) {
    try {
      this.logger.info(`Downloading file from: ${url}`);
      
      const response = await this.authenticatedGet(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        this.logger.debug(`Created directory: ${outputDir}`);
      }

      // Get file content as buffer
      const buffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      
      // Write file
      fs.writeFileSync(outputPath, uint8Array);
      
      const fileSize = fs.statSync(outputPath).size;
      this.logger.success(`File downloaded successfully: ${outputPath} (${fileSize} bytes)`);
      
      return true;
    } catch (error) {
      this.logger.error(`Download error: ${error.message}`);
      return false;
    }
  }

  /**
   * Get stored cookie by name
   * @param {string} name - Cookie name
   * @returns {Object|null} Cookie object or null
   */
  getCookie(name) {
    return this.cookies.get(name) || null;
  }

  /**
   * Get PHPSESSID cookie specifically
   * @returns {string|null} PHPSESSID value or null
   */
  getPHPSESSID() {
    const cookie = this.getCookie('PHPSESSID');
    return cookie ? cookie.value : null;
  }

  /**
   * Clear all stored cookies
   */
  clearCookies() {
    this.cookies.clear();
    this.logger.debug('Cleared all stored cookies');
  }

  /**
   * Check if user is authenticated (has PHPSESSID)
   * @returns {boolean} Authentication status
   */
  isAuthenticated() {
    return this.getPHPSESSID() !== null;
  }
}
