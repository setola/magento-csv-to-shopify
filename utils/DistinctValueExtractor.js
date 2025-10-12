#!/usr/bin/env node

/**
 * Script to extract distinct values from a specified column in the export_catalog_product CSV file.
 * 
 * Usage:
 *     node utils/DistinctValueExtractor.js <column_name> [csv_file_path] [options]
 * 
 * Arguments:
 *     column_name: Name of the column to extract distinct values from
 *     csv_file_path: Path to CSV file (optional, defaults to searching for catalog_product*.csv)
 * 
 * Options:
 *     --output, -o: Write results to a file instead of stdout
 *     --count, -c: Show count of each distinct value
 *     --sort, -s: Sort the output alphabetically
 *     --list-columns, -l: List available columns and exit
 *     --delimiter, -d: CSV delimiter (default: ,)
 *     --help, -h: Show this help message
 * 
 * Examples:
 *     node utils/DistinctValueExtractor.js "product_type"
 *     node utils/DistinctValueExtractor.js "categories" --count --sort
 *     node utils/DistinctValueExtractor.js "sku" public_html/var/export/catalog_product_20250623_161510.csv
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
 * Extract distinct values from the specified column.
 * @param {string} filePath - Path to the CSV file
 * @param {string} columnName - Name of the column to extract values from
 * @param {string} delimiter - CSV delimiter
 * @returns {Promise<{distinctValues: Set<string>, valueCounts: Map<string, number>}|null>}
 */
async function extractDistinctValues(filePath, columnName, delimiter = ',') {
    return new Promise((resolve, reject) => {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const distinctValues = new Set();
            const valueCounts = new Map();
            
            Papa.parse(fileContent, {
                header: true,
                delimiter: delimiter,
                skipEmptyLines: true,
                step: (results) => {
                    if (results.errors.length > 0) {
                        console.warn('Parse warnings:', results.errors);
                    }
                    
                    const row = results.data;
                    
                    // Check if column exists (only on first row)
                    if (distinctValues.size === 0 && valueCounts.size === 0) {
                        if (!(columnName in row)) {
                            const availableColumns = Object.keys(row);
                            console.error(`Error: Column '${columnName}' not found!`);
                            console.error(`Available columns (first 10): ${availableColumns.slice(0, 10).join(', ')}`);
                            if (availableColumns.length > 10) {
                                console.error(`... and ${availableColumns.length - 10} more columns`);
                            }
                            resolve(null);
                            return;
                        }
                    }
                    
                    const value = row[columnName];
                    if (value) {
                        const trimmedValue = value.toString().trim();
                        if (trimmedValue) {
                            distinctValues.add(trimmedValue);
                            valueCounts.set(trimmedValue, (valueCounts.get(trimmedValue) || 0) + 1);
                        }
                    }
                },
                complete: () => {
                    resolve({ distinctValues, valueCounts });
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
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {object} Parsed arguments
 */
function parseArguments(args) {
    const options = {
        columnName: null,
        csvFile: null,
        output: null,
        count: false,
        sort: false,
        delimiter: ',',
        listColumns: false,
        help: false
    };
    
    let i = 2; // Skip node and script name
    while (i < args.length) {
        const arg = args[i];
        
        switch (arg) {
            case '--output':
            case '-o':
                options.output = args[++i];
                break;
            case '--count':
            case '-c':
                options.count = true;
                break;
            case '--sort':
            case '-s':
                options.sort = true;
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
Script to extract distinct values from a specified column in the export_catalog_product CSV file.

Usage:
    node utils/DistinctValueExtractor.js <column_name> [csv_file_path] [options]

Arguments:
    column_name: Name of the column to extract distinct values from
    csv_file_path: Path to CSV file (optional, defaults to searching for catalog_product*.csv)

Options:
    --output, -o: Write results to a file instead of stdout
    --count, -c: Show count of each distinct value
    --sort, -s: Sort the output alphabetically
    --list-columns, -l: List available columns and exit
    --delimiter, -d: CSV delimiter (default: ,)
    --help, -h: Show this help message

Examples:
    node utils/DistinctValueExtractor.js "product_type"
    node utils/DistinctValueExtractor.js "categories" --count --sort
    node utils/DistinctValueExtractor.js "sku" public_html/var/export/catalog_product_20250623_161510.csv
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
    
    // Extract distinct values
    const result = await extractDistinctValues(csvFile, options.columnName, options.delimiter);
    
    if (!result) {
        return 1;
    }
    
    const { distinctValues, valueCounts } = result;
    
    // Prepare output
    const outputLines = [];
    
    if (options.count) {
        let results;
        if (options.sort) {
            results = Array.from(valueCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        } else {
            results = Array.from(valueCounts.entries()).sort((a, b) => b[1] - a[1]); // Sort by count desc
        }
        
        outputLines.push(`Distinct values in column '${options.columnName}' (with counts):`);
        outputLines.push(`Total distinct values: ${distinctValues.size}`);
        outputLines.push('-'.repeat(50));
        
        for (const [value, count] of results) {
            outputLines.push(`${String(count).padStart(5, ' ')} | ${value}`);
        }
    } else {
        let results;
        if (options.sort) {
            results = Array.from(distinctValues).sort();
        } else {
            results = Array.from(distinctValues);
        }
        
        outputLines.push(`Distinct values in column '${options.columnName}':`);
        outputLines.push(`Total distinct values: ${distinctValues.size}`);
        outputLines.push('-'.repeat(50));
        
        for (const value of results) {
            outputLines.push(value);
        }
    }
    
    // Output results
    if (options.output) {
        try {
            fs.writeFileSync(options.output, outputLines.join('\n'), 'utf-8');
            console.log(`Results written to: ${options.output}`);
        } catch (error) {
            console.error(`Error writing to file: ${error.message}`);
            return 1;
        }
    } else {
        outputLines.forEach(line => console.log(line));
    }
    
    return 0;
}

// Export the functions for potential use as a module
export { extractDistinctValues, getCsvHeaders, findCatalogProductFile };

// Run main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const exitCode = await main();
    process.exit(exitCode);
}