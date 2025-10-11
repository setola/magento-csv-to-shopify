#!/usr/bin/env python3
"""
CSV Row Counter

Counts the number of rows in a CSV file, properly handling multiline content
within quoted fields. Uses Python's csv library for robust parsing.

Usage:
    python count_csv_rows.py [filename]
    
If no filename is provided, it will use the CSV_FILE environment variable.
"""

import csv
import sys
import os
from pathlib import Path


def count_csv_rows(filename):
    """
    Count rows in a CSV file, handling multiline content properly.
    
    Args:
        filename (str): Path to the CSV file
        
    Returns:
        tuple: (total_rows, header_included)
    """
    try:
        with open(filename, 'r', encoding='utf-8', newline='') as csvfile:
            # Use csv.reader to properly handle quoted multiline content
            reader = csv.reader(csvfile)
            
            # Count all rows
            row_count = sum(1 for row in reader)
            
            return row_count
            
    except FileNotFoundError:
        print(f"Error: File '{filename}' not found.")
        return None
    except PermissionError:
        print(f"Error: Permission denied to read '{filename}'.")
        return None
    except Exception as e:
        print(f"Error reading CSV file: {e}")
        return None


def main():
    # Get filename from command line argument or environment variable
    if len(sys.argv) > 1:
        csv_file = sys.argv[1]
    elif 'CSV_FILE' in os.environ:
        csv_file = os.environ['CSV_FILE']
    else:
        print("Error: No CSV file specified.")
        print("Usage: python count_csv_rows.py [filename]")
        print("Or set the CSV_FILE environment variable.")
        sys.exit(1)
    
    # Check if file exists
    if not Path(csv_file).exists():
        print(f"Error: File '{csv_file}' does not exist.")
        sys.exit(1)
    
    # Count rows
    row_count = count_csv_rows(csv_file)
    
    if row_count is not None:
        print(f"CSV file: {csv_file}")
        print(f"Total rows: {row_count}")
        
        # Provide additional info about whether this likely includes headers
        if row_count > 0:
            print(f"Note: This count includes all rows (including header row if present)")
        else:
            print("The file appears to be empty or contains no valid CSV rows.")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()