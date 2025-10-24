#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import Logger from './utils/Logger.js';
import WebAuthenticator from './utils/WebAuthenticator.js';

// Load environment variables
dotenv.config();

/**
 * Main script for web authentication and CSV file download
 */
class WebDownloader {
  constructor() {
    this.logger = new Logger();
    this.authenticator = new WebAuthenticator(this.logger);
    
    // Configuration from environment variables
    this.config = {
      loginUrl: process.env.LOGIN_URL,
      downloadUrl: process.env.DOWNLOAD_URL,
      username: process.env.WEB_USERNAME,
      password: process.env.WEB_PASSWORD,
      outputDir: process.env.OUTPUT_DIR || './data',
      filename: process.env.DOWNLOAD_FILENAME || 'downloaded_file.csv'
    };
  }

  /**
   * Validate required configuration
   * @returns {boolean} Validation result
   */
  validateConfig() {
    const required = ['loginUrl', 'downloadUrl', 'username', 'password'];
    const missing = required.filter(key => !this.config[key]);
    
    if (missing.length > 0) {
      this.logger.error(`Missing required configuration: ${missing.join(', ')}`);
      this.logger.info('Please set the following environment variables:');
      missing.forEach(key => {
        this.logger.info(`  - ${key.toUpperCase()}`);
      });
      return false;
    }
    
    return true;
  }

  /**
   * Perform login and authentication
   * @returns {Promise<boolean>} Success status
   */
  async authenticate() {
    try {
      this.logger.info('Starting authentication process...');
      
      const success = await this.authenticator.login(
        this.config.loginUrl,
        this.config.username,
        this.config.password
      );
      
      if (success) {
        const phpsessid = this.authenticator.getPHPSESSID();
        if (phpsessid) {
          this.logger.success(`Authentication successful. PHPSESSID: ${phpsessid.substring(0, 10)}...`);
        } else {
          this.logger.warn('Authentication completed but no PHPSESSID found');
        }
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Authentication failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Download CSV file from authenticated URL
   * @returns {Promise<boolean>} Success status
   */
  async downloadCSV() {
    try {
      this.logger.info('Starting CSV download...');
      
      // Generate output filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = this.config.filename.replace('.csv', `_${timestamp}.csv`);
      const outputPath = path.join(this.config.outputDir, filename);
      
      const success = await this.authenticator.downloadFile(
        this.config.downloadUrl,
        outputPath
      );
      
      if (success) {
        this.logger.success(`CSV file downloaded to: ${outputPath}`);
      }
      
      return success;
    } catch (error) {
      this.logger.error(`CSV download failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Main execution method
   */
  async run() {
    try {
      this.logger.info('Starting Web Downloader...');
      
      // Validate configuration
      if (!this.validateConfig()) {
        process.exit(1);
      }
      
      // Authenticate
      const authSuccess = await this.authenticate();
      if (!authSuccess) {
        this.logger.error('Authentication failed. Exiting.');
        process.exit(1);
      }
      
      // Download CSV file
      const downloadSuccess = await this.downloadCSV();
      if (!downloadSuccess) {
        this.logger.error('CSV download failed. Exiting.');
        process.exit(1);
      }
      
      this.logger.success('Web download process completed successfully!');
      
    } catch (error) {
      this.logger.error(`Unexpected error: ${error.message}`);
      process.exit(1);
    }
  }
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const downloader = new WebDownloader();
  downloader.run();
}

export default WebDownloader;
