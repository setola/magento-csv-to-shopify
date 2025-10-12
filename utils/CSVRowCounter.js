#!/usr/bin/env node

/**
 * CSV Row Counter
 * 
 * Counts the number of rows in a CSV file, properly handling multiline content
 * within quoted fields. Uses Papa Parse for robust CSV parsing.
 * 
 * Usage:
 *     node utils/CSVRowCounter.js [filename]
 *     
 * If no filename is provided, it will use the CSV_FILE environment variable.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import Papa from 'papaparse';

// Load environment variables
dotenv.config();

/**
 * Count rows in a CSV file, handling multiline content properly.
 * 
 * @param {string} filename - Path to the CSV file
 * @returns {Promise<number|null>} Total number of rows or null on error
 */
async function countCsvRows(filename) {
    try {
        // Check if file exists
        if (!fs.existsSync(filename)) {
            console.error(`Error: File '${filename}' not found.`);
            return null;
        }

        // Read file content
        const fileContent = fs.readFileSync(filename, 'utf-8');
        
        // Parse CSV using Papa Parse (same library used in CSVParser.js)
        return new Promise((resolve, reject) => {
            Papa.parse(fileContent, {
                header: false, // We just want to count rows, not parse headers
                skipEmptyLines: true,
                complete: (results) => {
                    resolve(results.data.length);
                },
                error: (error) => {
                    console.error(`Error parsing CSV file: ${error.message}`);
                    reject(error);
                }
            });
        });

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`Error: File '${filename}' not found.`);
        } else if (error.code === 'EACCES') {
            console.error(`Error: Permission denied to read '${filename}'.`);
        } else {
            console.error(`Error reading CSV file: ${error.message}`);
        }
        return null;
    }
}

/**
 * Main function
 */
async function main() {
    // Get filename from command line argument or environment variable
    let csvFile;
    
    if (process.argv.length > 2) {
        csvFile = process.argv[2];
    } else if (process.env.CSV_FILE) {
        csvFile = process.env.CSV_FILE;
    } else {
        console.error('Error: No CSV file specified.');
        console.error('Usage: node utils/CSVRowCounter.js [filename]');
        console.error('Or set the CSV_FILE environment variable.');
        process.exit(1);
    }
    
    // Check if file exists
    if (!fs.existsSync(csvFile)) {
        console.error(`Error: File '${csvFile}' does not exist.`);
        process.exit(1);
    }
    
    // Count rows
    const rowCount = await countCsvRows(csvFile);
    
    if (rowCount !== null) {
        console.log(`CSV file: ${csvFile}`);
        console.log(`Total rows: ${rowCount}`);
        
        // Provide additional info about whether this likely includes headers
        if (rowCount > 0) {
            console.log('Note: This count includes all rows (including header row if present)');
        } else {
            console.log('The file appears to be empty or contains no valid CSV rows.');
        }
    } else {
        process.exit(1);
    }
}

// Export the function for potential use as a module
export { countCsvRows };

// Run main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}