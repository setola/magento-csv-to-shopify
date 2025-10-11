#!/usr/bin/env python3
"""
Script to extract distinct values from a specified column in the export_catalog_product CSV file.

Usage:
    python extract_distinct_values.py <column_name> [csv_file_path] [--output output_file] [--count]

Arguments:
    column_name: Name of the column to extract distinct values from
    csv_file_path: Path to CSV file (optional, defaults to searching for catalog_product*.csv)
    --output: Write results to a file instead of stdout
    --count: Show count of each distinct value
    --sort: Sort the output alphabetically
    --help: Show this help message

Examples:
    python extract_distinct_values.py "product_type"
    python extract_distinct_values.py "categories" --count --sort
    python extract_distinct_values.py "sku" public_html/var/export/catalog_product_20250623_161510.csv
"""

import csv
import sys
import os
import glob
import argparse
from collections import Counter
from pathlib import Path

def find_catalog_product_file():
    """Find the catalog product CSV file in the current directory structure."""
    # Prioritize patterns that are most likely to be the export files
    search_patterns = [
        "export_catalog_product*.csv",
        "**/export/catalog_product*.csv", 
        "**/var/export/catalog_product*.csv",
        "export_catalog_product.csv",
        "**/export_catalog_product.csv",
        "catalog_product*.csv",
        "**/catalog_product*.csv"
    ]
    
    for pattern in search_patterns:
        files = list(glob.glob(pattern, recursive=True))
        # Filter out test files that are likely not the main export
        filtered_files = [f for f in files if 'test' not in f.lower() and 'sample' not in f.lower()]
        if filtered_files:
            # Return the most recent file if multiple found
            return max(filtered_files, key=os.path.getctime)
        elif files:  # fallback to all files if no non-test files found
            return max(files, key=os.path.getctime)
    
    return None

def get_csv_headers(file_path, delimiter=','):
    """Get the column headers from the CSV file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            reader = csv.reader(file, delimiter=delimiter)
            headers = next(reader)
            return [h.strip() for h in headers]
    except Exception as e:
        print(f"Error reading headers: {e}")
        return []

def extract_distinct_values(file_path, column_name, delimiter=','):
    """Extract distinct values from the specified column."""
    distinct_values = set()
    value_counts = Counter()
    
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file, delimiter=delimiter)
            
            # Check if column exists
            if column_name not in reader.fieldnames:
                available_columns = ', '.join(reader.fieldnames[:10])  # Show first 10 columns
                print(f"Error: Column '{column_name}' not found!")
                print(f"Available columns (first 10): {available_columns}")
                if len(reader.fieldnames) > 10:
                    print(f"... and {len(reader.fieldnames) - 10} more columns")
                return None, None
            
            for row in reader:
                value = row[column_name]
                if value:  # Only count non-empty values
                    value = value.strip()
                    if value:  # Only count non-whitespace values
                        distinct_values.add(value)
                        value_counts[value] += 1
        
        return distinct_values, value_counts
    
    except Exception as e:
        print(f"Error processing file: {e}")
        return None, None

def main():
    parser = argparse.ArgumentParser(
        description="Extract distinct values from a CSV column",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument('column_name', nargs='?', help='Name of the column to extract values from')
    parser.add_argument('csv_file', nargs='?', help='Path to CSV file (optional)')
    parser.add_argument('--output', '-o', help='Output file path')
    parser.add_argument('--count', '-c', action='store_true', help='Show count of each value')
    parser.add_argument('--sort', '-s', action='store_true', help='Sort output alphabetically')
    parser.add_argument('--delimiter', '-d', default=',', help='CSV delimiter (default: ,)')
    parser.add_argument('--list-columns', '-l', action='store_true', help='List available columns and exit')
    
    args = parser.parse_args()
    
    # Find CSV file
    if args.csv_file:
        csv_file = args.csv_file
    else:
        csv_file = find_catalog_product_file()
        if not csv_file:
            print("Error: Could not find catalog product CSV file.")
            print("Please specify the file path as an argument.")
            return 1
    
    # Check if file exists
    if not os.path.exists(csv_file):
        print(f"Error: File '{csv_file}' not found.")
        return 1
    
    print(f"Using CSV file: {csv_file}")
    
    # List columns if requested
    if args.list_columns:
        headers = get_csv_headers(csv_file, args.delimiter)
        print(f"\nAvailable columns ({len(headers)} total):")
        for i, header in enumerate(headers, 1):
            print(f"{i:2d}. {header}")
        return 0
    
    # Validate column_name is provided when not listing columns
    if not args.column_name:
        print("Error: column_name is required when not using --list-columns")
        parser.print_help()
        return 1
    
    # Extract distinct values
    distinct_values, value_counts = extract_distinct_values(csv_file, args.column_name, args.delimiter)
    
    if distinct_values is None:
        return 1
    
    # Prepare output
    if args.count:
        if args.sort:
            results = sorted(value_counts.items(), key=lambda x: x[0])
        else:
            results = value_counts.most_common()
        
        output_lines = []
        output_lines.append(f"Distinct values in column '{args.column_name}' (with counts):")
        output_lines.append(f"Total distinct values: {len(distinct_values)}")
        output_lines.append("-" * 50)
        
        for value, count in results:
            output_lines.append(f"{count:5d} | {value}")
    else:
        if args.sort:
            results = sorted(distinct_values)
        else:
            results = list(distinct_values)
        
        output_lines = []
        output_lines.append(f"Distinct values in column '{args.column_name}':")
        output_lines.append(f"Total distinct values: {len(distinct_values)}")
        output_lines.append("-" * 50)
        
        for value in results:
            output_lines.append(value)
    
    # Output results
    if args.output:
        try:
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write('\n'.join(output_lines))
            print(f"Results written to: {args.output}")
        except Exception as e:
            print(f"Error writing to file: {e}")
            return 1
    else:
        for line in output_lines:
            print(line)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())