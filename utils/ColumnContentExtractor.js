#!/usr/bin/env node

/**
 * Script to extract rows from CSV files where a specified column has content (non-empty) or matches a specific value.
 * 
 * Usage:
 *     node utils/ColumnContentExtractor.js <column_name> [csv_file_path] [options]
 * 
 * Arguments:
 *     column_name: Name of the column to check for content or specific value
 *     csv_file_path: Path to CSV file (optional, defaults to searching for catalog_product*.csv)
 * 
 * Options:
 *     --output, -o: Write results to a file instead of stdout
 *     --include-header: Include header row in output (default: true)
 *     --no-header: Do not include header row in output
 *     --list-columns, -l: List available columns and exit
 *     --delimiter, -d: CSV delimiter (default: ,)
 *     --help, -h: Show this help message
 *     --count-only: Only show count of matching rows
 *     --value, -v: Extract rows where column equals this specific value (instead of checking for any content)
 *     --contains, -c: Extract rows where column contains this substring
 *     --case-insensitive, -i: Make value/contains matching case-insensitive
 * 
 * Examples:
 *     node utils/ColumnContentExtractor.js "description"
 *     node utils/ColumnContentExtractor.js "short_description" --output filtered_products.csv
 *     node utils/ColumnContentExtractor.js "categories" data/products.csv --count-only
 *     node utils/ColumnContentExtractor.js "status" --value "Enabled" --output enabled_products.csv
 *     node utils/ColumnContentExtractor.js "name" --contains "iPhone" --case-insensitive
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import Papa from 'papaparse';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Find the catalog product CSV file in the current directory structure.
 * @returns {string|null} Path to the found CSV file or null
 */
async function findCatalogProductFile() {
    // Prioritize patterns that are most likely to be the export files
    const searchPatterns = [
        "export_catalog_product*.csv",
        "**/export/catalog_product*.csv", 
        "**/var/export/catalog_product*.csv",
        "export_catalog_product.csv",
        "**/export_catalog_product.csv",
        "catalog_product*.csv",
        "**/catalog_product*.csv"
    ];
    
    for (const pattern of searchPatterns) {
        try {
            const files = await glob(pattern);
            // Filter out test files that are likely not the main export
            const filteredFiles = files.filter(f => 
                !f.toLowerCase().includes('test') && 
                !f.toLowerCase().includes('sample')
            );
            
            if (filteredFiles.length > 0) {
                // Return the most recent file if multiple found
                const fileStats = filteredFiles.map(f => ({
                    file: f,
                    mtime: fs.statSync(f).mtime
                }));
                fileStats.sort((a, b) => b.mtime - a.mtime);
                return fileStats[0].file;
            } else if (files.length > 0) {
                // Fallback to all files if no non-test files found
                const fileStats = files.map(f => ({
                    file: f,
                    mtime: fs.statSync(f).mtime
                }));
                fileStats.sort((a, b) => b.mtime - a.mtime);
                return fileStats[0].file;
            }
        } catch (error) {
            // Continue to next pattern if this one fails
            continue;
        }
    }
    
    return null;
}

/**
 * Get the column headers from the CSV file.
 * @param {string} filePath - Path to the CSV file
 * @param {string} delimiter - CSV delimiter
 * @returns {Promise<string[]>} Array of column headers
 */
async function getCsvHeaders(filePath, delimiter = ',') {
    return new Promise((resolve, reject) => {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            
            Papa.parse(fileContent, {
                header: false,
                delimiter: delimiter,
                preview: 1, // Only read the first row
                complete: (results) => {
                    if (results.data && results.data.length > 0) {
                        const headers = results.data[0].map(h => h.trim());
                        resolve(headers);
                    } else {
                        resolve([]);
                    }
                },
                error: (error) => {
                    console.error(`Error reading headers: ${error.message}`);
                    resolve([]);
                }
            });
        } catch (error) {
            console.error(`Error reading headers: ${error.message}`);
            resolve([]);
        }
    });
}

/**
 * Extract rows based on column criteria.
 * @param {string} filePath - Path to the CSV file
 * @param {string} columnName - Name of the column to check
 * @param {string} delimiter - CSV delimiter
 * @param {boolean} countOnly - If true, only return count
 * @param {object} matchCriteria - Matching criteria object
 * @param {string} matchCriteria.type - Type of matching: 'content', 'value', or 'contains'
 * @param {string} matchCriteria.value - Value to match (for 'value' and 'contains' types)
 * @param {boolean} matchCriteria.caseInsensitive - Whether to perform case-insensitive matching
 * @returns {Promise<{rows: Array, count: number, headers: Array}|null>}
 */
async function extractRowsWithContent(filePath, columnName, delimiter = ',', countOnly = false, matchCriteria = { type: 'content' }) {
    return new Promise((resolve, reject) => {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const matchingRows = [];
            let headers = [];
            let count = 0;
            let columnExists = false;
            
            Papa.parse(fileContent, {
                header: true,
                delimiter: delimiter,
                skipEmptyLines: true,
                step: (results) => {
                    if (results.errors.length > 0) {
                        console.warn('Parse warnings:', results.errors);
                    }
                    
                    const row = results.data;
                    
                    // Check if column exists and get headers (only on first row)
                    if (!columnExists) {
                        headers = Object.keys(row);
                        if (!(columnName in row)) {
                            const availableColumns = headers;
                            console.error(`Error: Column '${columnName}' not found!`);
                            console.error(`Available columns (first 10): ${availableColumns.slice(0, 10).join(', ')}`);
                            if (availableColumns.length > 10) {
                                console.error(`... and ${availableColumns.length - 10} more columns`);
                            }
                            resolve(null);
                            return;
                        }
                        columnExists = true;
                    }
                    
                    const value = row[columnName];
                    let matches = false;
                    
                    // Determine if this row matches based on criteria
                    switch (matchCriteria.type) {
                        case 'content':
                            // Original behavior: check if column has any content
                            matches = value && value.toString().trim();
                            break;
                            
                        case 'value':
                            // Exact value matching
                            const rowValue = value ? value.toString().trim() : '';
                            const targetValue = matchCriteria.value || '';
                            
                            if (matchCriteria.caseInsensitive) {
                                matches = rowValue.toLowerCase() === targetValue.toLowerCase();
                            } else {
                                matches = rowValue === targetValue;
                            }
                            break;
                            
                        case 'contains':
                            // Substring matching
                            const containsRowValue = value ? value.toString() : '';
                            const containsTarget = matchCriteria.value || '';
                            
                            if (containsTarget === '') {
                                matches = false;
                            } else if (matchCriteria.caseInsensitive) {
                                matches = containsRowValue.toLowerCase().includes(containsTarget.toLowerCase());
                            } else {
                                matches = containsRowValue.includes(containsTarget);
                            }
                            break;
                            
                        default:
                            matches = false;
                    }
                    
                    if (matches) {
                        count++;
                        if (!countOnly) {
                            matchingRows.push(row);
                        }
                    }
                },
                complete: () => {
                    resolve({ 
                        rows: countOnly ? [] : matchingRows, 
                        count, 
                        headers 
                    });
                },
                error: (error) => {
                    console.error(`Error processing file: ${error.message}`);
                    resolve(null);
                }
            });
        } catch (error) {
            console.error(`Error processing file: ${error.message}`);
            resolve(null);
        }
    });
}

/**
 * Convert array of row objects back to CSV format
 * @param {Array} rows - Array of row objects
 * @param {Array} headers - Array of column headers
 * @param {boolean} includeHeader - Whether to include header row
 * @returns {string} CSV formatted string
 */
function rowsToCSV(rows, headers, includeHeader = true) {
    const csvRows = [];
    
    if (includeHeader) {
        csvRows.push(headers);
    }
    
    rows.forEach(row => {
        const values = headers.map(header => {
            const value = row[header] || '';
            // Escape quotes and wrap in quotes if contains comma or quote
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        csvRows.push(values);
    });
    
    return csvRows.map(row => row.join(',')).join('\n');
}

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {object} Parsed arguments
 */
function parseArguments(args) {
    const options = {
        columnName: null,
        csvFile: null,
        output: null,
        includeHeader: true,
        delimiter: ',',
        listColumns: false,
        help: false,
        countOnly: false,
        value: null,
        contains: null,
        caseInsensitive: false
    };
    
    let i = 2; // Skip node and script name
    while (i < args.length) {
        const arg = args[i];
        
        switch (arg) {
            case '--output':
            case '-o':
                options.output = args[++i];
                break;
            case '--include-header':
                options.includeHeader = true;
                break;
            case '--no-header':
                options.includeHeader = false;
                break;
            case '--delimiter':
            case '-d':
                options.delimiter = args[++i];
                break;
            case '--list-columns':
            case '-l':
                options.listColumns = true;
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            case '--count-only':
                options.countOnly = true;
                break;
            case '--value':
            case '-v':
                options.value = args[++i];
                break;
            case '--contains':
            case '-c':
                options.contains = args[++i];
                break;
            case '--case-insensitive':
            case '-i':
                options.caseInsensitive = true;
                break;
            default:
                if (!options.columnName && !arg.startsWith('-')) {
                    options.columnName = arg;
                } else if (!options.csvFile && !arg.startsWith('-')) {
                    options.csvFile = arg;
                }
                break;
        }
        i++;
    }
    
    return options;
}

/**
 * Show help message
 */
function showHelp() {
    console.log(`
Script to extract rows from CSV files where a specified column has content (non-empty) or matches a specific value.

Usage:
    node utils/ColumnContentExtractor.js <column_name> [csv_file_path] [options]

Arguments:
    column_name: Name of the column to check for content or specific value
    csv_file_path: Path to CSV file (optional, defaults to searching for catalog_product*.csv)

Options:
    --output, -o: Write results to a file instead of stdout
    --include-header: Include header row in output (default: true)
    --no-header: Do not include header row in output
    --list-columns, -l: List available columns and exit
    --delimiter, -d: CSV delimiter (default: ,)
    --help, -h: Show this help message
    --count-only: Only show count of matching rows
    --value, -v: Extract rows where column equals this specific value (instead of checking for any content)
    --contains, -c: Extract rows where column contains this substring
    --case-insensitive, -i: Make value/contains matching case-insensitive

Examples:
    node utils/ColumnContentExtractor.js "description"
    node utils/ColumnContentExtractor.js "short_description" --output filtered_products.csv
    node utils/ColumnContentExtractor.js "categories" data/products.csv --count-only
    node utils/ColumnContentExtractor.js "status" --value "Enabled" --output enabled_products.csv
    node utils/ColumnContentExtractor.js "name" --contains "iPhone" --case-insensitive
`);
}

/**
 * Main function
 */
async function main() {
    const options = parseArguments(process.argv);
    
    if (options.help) {
        showHelp();
        return 0;
    }
    
    // Find CSV file
    let csvFile;
    if (options.csvFile) {
        csvFile = options.csvFile;
    } else {
        csvFile = await findCatalogProductFile();
        if (!csvFile) {
            console.error('Error: Could not find catalog product CSV file.');
            console.error('Please specify the file path as an argument.');
            return 1;
        }
    }
    
    // Check if file exists
    if (!fs.existsSync(csvFile)) {
        console.error(`Error: File '${csvFile}' not found.`);
        return 1;
    }
    
    console.log(`Using CSV file: ${csvFile}`);
    
    // List columns if requested
    if (options.listColumns) {
        const headers = await getCsvHeaders(csvFile, options.delimiter);
        console.log(`\nAvailable columns (${headers.length} total):`);
        headers.forEach((header, index) => {
            console.log(`${String(index + 1).padStart(2, ' ')}. ${header}`);
        });
        return 0;
    }
    
    // Validate column_name is provided when not listing columns
    if (!options.columnName) {
        console.error('Error: column_name is required when not using --list-columns');
        showHelp();
        return 1;
    }
    
    // Validate options: value and contains are mutually exclusive
    if (options.value !== null && options.contains !== null) {
        console.error('Error: --value and --contains options cannot be used together.');
        return 1;
    }
    
    // Build match criteria based on options
    const matchCriteria = {
        type: 'content', // default
        caseInsensitive: options.caseInsensitive
    };
    
    if (options.value !== null) {
        matchCriteria.type = 'value';
        matchCriteria.value = options.value;
    } else if (options.contains !== null) {
        matchCriteria.type = 'contains';
        matchCriteria.value = options.contains;
    }
    
    // Extract rows based on criteria
    const result = await extractRowsWithContent(csvFile, options.columnName, options.delimiter, options.countOnly, matchCriteria);
    
    if (!result) {
        return 1;
    }
    
    const { rows, count, headers } = result;
    
    // Generate appropriate message based on matching criteria
    let criteriaDescription;
    switch (matchCriteria.type) {
        case 'value':
            criteriaDescription = `equals '${matchCriteria.value}'${options.caseInsensitive ? ' (case-insensitive)' : ''}`;
            break;
        case 'contains':
            criteriaDescription = `contains '${matchCriteria.value}'${options.caseInsensitive ? ' (case-insensitive)' : ''}`;
            break;
        default:
            criteriaDescription = 'has content';
    }
    
    if (options.countOnly) {
        console.log(`Found ${count} rows where column '${options.columnName}' ${criteriaDescription}.`);
        return 0;
    }
    
    console.log(`Found ${count} rows where column '${options.columnName}' ${criteriaDescription}.`);
    
    if (count === 0) {
        console.log('No matching rows found.');
        return 0;
    }
    
    // Prepare output
    const csvOutput = rowsToCSV(rows, headers, options.includeHeader);
    
    // Output results
    if (options.output) {
        try {
            fs.writeFileSync(options.output, csvOutput, 'utf-8');
            console.log(`Results written to: ${options.output}`);
            console.log(`Exported ${rows.length} rows${options.includeHeader ? ' (plus header)' : ''}.`);
        } catch (error) {
            console.error(`Error writing to file: ${error.message}`);
            return 1;
        }
    } else {
        console.log(csvOutput);
    }
    
    return 0;
}

/**
 * Convenience function to extract rows where a column equals a specific value.
 * @param {string} filePath - Path to the CSV file
 * @param {string} columnName - Name of the column to check
 * @param {string} value - Value to match exactly
 * @param {string} delimiter - CSV delimiter
 * @param {boolean} caseInsensitive - Whether to perform case-insensitive matching
 * @param {boolean} countOnly - If true, only return count
 * @returns {Promise<{rows: Array, count: number, headers: Array}|null>}
 */
async function extractRowsByValue(filePath, columnName, value, delimiter = ',', caseInsensitive = false, countOnly = false) {
    const matchCriteria = {
        type: 'value',
        value: value,
        caseInsensitive: caseInsensitive
    };
    
    return await extractRowsWithContent(filePath, columnName, delimiter, countOnly, matchCriteria);
}

/**
 * Convenience function to extract rows where a column contains a specific substring.
 * @param {string} filePath - Path to the CSV file
 * @param {string} columnName - Name of the column to check
 * @param {string} substring - Substring to search for
 * @param {string} delimiter - CSV delimiter
 * @param {boolean} caseInsensitive - Whether to perform case-insensitive matching
 * @param {boolean} countOnly - If true, only return count
 * @returns {Promise<{rows: Array, count: number, headers: Array}|null>}
 */
async function extractRowsByContains(filePath, columnName, substring, delimiter = ',', caseInsensitive = false, countOnly = false) {
    const matchCriteria = {
        type: 'contains',
        value: substring,
        caseInsensitive: caseInsensitive
    };
    
    return await extractRowsWithContent(filePath, columnName, delimiter, countOnly, matchCriteria);
}

// Export the functions for potential use as a module
export { 
    extractRowsWithContent, 
    extractRowsByValue, 
    extractRowsByContains, 
    getCsvHeaders, 
    findCatalogProductFile, 
    rowsToCSV 
};

// Run main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const exitCode = await main();
    process.exit(exitCode);
}