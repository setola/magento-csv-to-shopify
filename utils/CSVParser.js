/**
 * CSV Parser utility
 * Generic CSV parsing functionality for migration data
 */

import fs from 'fs';
import Papa from 'papaparse';

export default class CSVParser {
  constructor(logger) {
    this.log = logger;
  }

  // Parse CSV file and return data
  async parseCSV(csvPath) {
    return new Promise((resolve, reject) => {
      fs.readFile(csvPath, 'utf8', (err, data) => {
        if (err) {
          this.log(`Error reading CSV file: ${err.message}`, 'ERROR');
          reject(err);
          return;
        }

        Papa.parse(data, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            this.log(`CSV parsed successfully: ${results.data.length} rows found`, 'INFO');
            resolve(results.data);
          },
          error: (error) => {
            this.log(`Error parsing CSV: ${error.message}`, 'ERROR');
            reject(error);
          }
        });
      });
    });
  }

  // Get a batch of data from the parsed CSV
  getBatch(allData, startRow, batchSize) {
    const endRow = startRow + batchSize;
    const batch = allData.slice(startRow, endRow);
    
    this.log(`Selected batch: rows ${startRow} to ${endRow} (${batch.length} items)`, 'INFO');
    
    return {
      batch,
      totalItems: allData.length,
      startRow,
      endRow: Math.min(endRow, allData.length),
      hasMore: endRow < allData.length
    };
  }

  // Validate required fields exist in data
  validateRequiredFields(data, requiredFields, itemType = 'item') {
    const missingFields = [];
    const invalidItems = [];

    data.forEach((item, index) => {
      const missing = [];
      
      requiredFields.forEach(field => {
        if (!item[field] || item[field].toString().trim() === '') {
          missing.push(field);
        }
      });

      if (missing.length > 0) {
        invalidItems.push({
          index,
          item,
          missingFields: missing
        });
      }
    });

    if (invalidItems.length > 0) {
      this.log(`Found ${invalidItems.length} ${itemType}s with missing required fields`, 'WARN');
      invalidItems.forEach(({ index, missingFields }) => {
        this.log(`  Row ${index}: missing ${missingFields.join(', ')}`, 'WARN');
      });
    }

    return {
      valid: invalidItems.length === 0,
      invalidItems,
      validItems: data.filter((_, index) => !invalidItems.some(invalid => invalid.index === index))
    };
  }

  // Extract additional attributes from a delimited string (for Magento additional_attributes)
  parseAdditionalAttributes(attrString, delimiter = ',', keyValueSeparator = '=') {
    const attrs = {};
    if (!attrString) return attrs;

    const pairs = attrString.split(delimiter);
    pairs.forEach(pair => {
      const [key, ...valueParts] = pair.split(keyValueSeparator);
      if (key && valueParts.length > 0) {
        attrs[key.trim()] = valueParts.join(keyValueSeparator).trim();
      }
    });

    return attrs;
  }
}