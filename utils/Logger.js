import fs from 'fs';
import path from 'path';

/**
 * Logger utility class for dual output (console + file) with timestamped filenames
 */
class Logger {
  constructor(options = {}) {
    this.logDir = options.logDir || process.env.LOG_DIR || './logs';
    this.logFile = options.logFile || this.generateLogFilename();
    this.logLevels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      SUCCESS: 4
    };
    this.currentLogLevel = options.logLevel || 'DEBUG';
    
    // Ensure log directory exists
    this.ensureLogDirectory();
    
    // Log level colors for console output
    this.colors = {
      DEBUG: '\x1b[36m',   // Cyan
      INFO: '\x1b[37m',    // White
      WARN: '\x1b[33m',    // Yellow
      ERROR: '\x1b[31m',   // Red
      SUCCESS: '\x1b[32m', // Green
      RESET: '\x1b[0m'     // Reset
    };
  }

  /**
   * Generate timestamped log filename
   * @returns {string} Full path to log file
   */
  generateLogFilename() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // YYYY-MM-DDTHH-mm-ss
    return path.join(this.logDir, `migration-${timestamp}.log`);
  }

  /**
   * Ensure log directory exists
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Check if log level should be output
   * @param {string} level - Log level to check
   * @returns {boolean} Whether to output this level
   */
  shouldLog(level) {
    const levelValue = this.logLevels[level.toUpperCase()] ?? this.logLevels.INFO;
    const currentLevelValue = this.logLevels[this.currentLogLevel.toUpperCase()] ?? this.logLevels.DEBUG;
    return levelValue >= currentLevelValue;
  }

  /**
   * Format log message with timestamp and level
   * @param {string} message - Message to log
   * @param {string} level - Log level
   * @returns {Object} Formatted messages for console and file
   */
  formatMessage(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const upperLevel = level.toUpperCase();
    
    // File message (no colors)
    const fileMessage = `[${timestamp}] [${upperLevel}] ${message}\n`;
    
    // Console message (with colors)
    const color = this.colors[upperLevel] || this.colors.INFO;
    const consoleMessage = `${color}[${timestamp}] [${upperLevel}]${this.colors.RESET} ${message}`;
    
    return { fileMessage, consoleMessage };
  }

  /**
   * Write message to log file
   * @param {string} message - Formatted message for file
   */
  writeToFile(message) {
    try {
      fs.appendFileSync(this.logFile, message);
    } catch (error) {
      console.error(`Failed to write to log file ${this.logFile}: ${error.message}`);
    }
  }

  /**
   * Main logging function
   * @param {string} message - Message to log
   * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR, SUCCESS)
   */
  log(message, level = 'INFO') {
    const upperLevel = level.toUpperCase();
    
    // Check if this level should be logged
    if (!this.shouldLog(upperLevel)) {
      return;
    }

    const { fileMessage, consoleMessage } = this.formatMessage(message, upperLevel);
    
    // Output to console
    console.log(consoleMessage);
    
    // Write to file
    this.writeToFile(fileMessage);
  }

  /**
   * Debug level logging
   * @param {string} message - Message to log
   */
  debug(message) {
    this.log(message, 'DEBUG');
  }

  /**
   * Info level logging
   * @param {string} message - Message to log
   */
  info(message) {
    this.log(message, 'INFO');
  }

  /**
   * Warning level logging
   * @param {string} message - Message to log
   */
  warn(message) {
    this.log(message, 'WARN');
  }

  /**
   * Error level logging
   * @param {string} message - Message to log
   */
  error(message) {
    this.log(message, 'ERROR');
  }

  /**
   * Success level logging
   * @param {string} message - Message to log
   */
  success(message) {
    this.log(message, 'SUCCESS');
  }

  /**
   * Get current log file path
   * @returns {string} Current log file path
   */
  getLogFile() {
    return this.logFile;
  }

  /**
   * Set log level
   * @param {string} level - New log level
   */
  setLogLevel(level) {
    if (this.logLevels[level.toUpperCase()] !== undefined) {
      this.currentLogLevel = level.toUpperCase();
    } else {
      this.warn(`Invalid log level: ${level}. Using current level: ${this.currentLogLevel}`);
    }
  }

  /**
   * Create a new logger instance with different settings
   * @param {Object} options - Logger options
   * @returns {Logger} New logger instance
   */
  static create(options = {}) {
    return new Logger(options);
  }
}

export default Logger;