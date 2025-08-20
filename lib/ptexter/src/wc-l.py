#!/usr/bin/env python3
"""
wc-l.py - Count lines in a text file with optional regex filtering

High-performance line counter using Polars with optional regex pattern to ignore certain lines.
Outputs just the count number (no trailing newline) to the specified output file.
"""

import argparse
import sys
import re
from pathlib import Path
import polars as pl


def count_lines_optimized(input_file: str, ignore_pattern: str = None) -> int:
    """
    Count lines using optimized Polars approach (best from benchmarks: 31,000+ MB/s).
    
    Args:
        input_file: Path to input file
        ignore_pattern: Optional regex pattern - lines matching this will be ignored
        
    Returns:
        Number of lines (excluding ignored lines)
    """
    # Use the optimized single-column approach from our benchmarks
    df = pl.scan_csv(
        input_file,
        has_header=False,
        separator='\x00',  # Null separator to read as single column
        infer_schema_length=0,
        ignore_errors=True,
        low_memory=True,
    )
    
    if ignore_pattern is None:
        # Fast path - just count all lines
        return df.select(pl.len()).collect().item()
    else:
        # Need to filter lines - read the column and apply regex filter
        lines_df = df.collect()
        
        # Get the column (should be the first/only column)
        col_name = lines_df.columns[0]
        
        # Filter out lines matching the ignore pattern
        filtered_df = lines_df.filter(
            ~pl.col(col_name).str.contains(ignore_pattern, literal=False)
        )
        
        return len(filtered_df)


def wc_lines(input_file: str, output_file: str, ignore_pattern: str = None):
    """
    Count lines in input_file and write count to output_file.
    
    Args:
        input_file: Path to input file
        output_file: Path to output file (will contain just the count)
        ignore_pattern: Optional regex pattern - lines matching this will be ignored
    """
    try:
        input_path = Path(input_file)
        output_path = Path(output_file)
        
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_file}")
            
        if not input_path.is_file():
            raise ValueError(f"Input path is not a file: {input_file}")
        
        # Create output directory if it doesn't exist
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Count lines using optimized Polars approach
        line_count = count_lines_optimized(input_file, ignore_pattern)
        
        # Write count to output file (no trailing newline as requested)
        with open(output_path, 'w', encoding='utf-8') as outfile:
            outfile.write(str(line_count))
        
        return line_count
        
    except UnicodeDecodeError as e:
        raise ValueError(f"Failed to decode input file as UTF-8: {e}") from e
    except IOError as e:
        raise IOError(f"File I/O error: {e}") from e
    except re.error as e:
        raise ValueError(f"Invalid regex pattern '{ignore_pattern}': {e}") from e


def main():
    parser = argparse.ArgumentParser(
        description='Count lines in a text file with optional regex filtering',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python wc-l.py input.txt output.txt
  python wc-l.py --ignore-pattern '^#' input.txt output.txt  # Skip comment lines
  python wc-l.py --ignore-pattern '^\\s*$' input.txt output.txt  # Skip empty lines
        """
    )
    
    parser.add_argument(
        '--ignore-pattern',
        type=str,
        help='Optional regex pattern - lines matching this pattern will be ignored'
    )
    
    parser.add_argument(
        'input_file',
        help='Input text file path'
    )
    
    parser.add_argument(
        'output_file', 
        help='Output file path (will contain just the line count)'
    )
    
    args = parser.parse_args()
    
    # Validate regex pattern if provided
    if args.ignore_pattern:
        try:
            re.compile(args.ignore_pattern)
        except re.error as e:
            print(f"Error: Invalid regex pattern '{args.ignore_pattern}': {e}", file=sys.stderr)
            sys.exit(1)
    
    try:
        line_count = wc_lines(
            args.input_file, 
            args.output_file,
            args.ignore_pattern
        )
        
        ignored_msg = f" (excluding lines matching '{args.ignore_pattern}')" if args.ignore_pattern else ""
        print(f"Successfully counted {line_count} lines{ignored_msg} and wrote to {args.output_file}")
        
    except (FileNotFoundError, ValueError, IOError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nOperation cancelled by user", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
