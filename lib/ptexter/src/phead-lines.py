#!/usr/bin/env python3
"""
phead-lines.py - Extract first N lines or N bytes from a text file

Similar to Unix head command, but with both line and byte limits.
Stops processing when either limit is reached (whichever comes first).
"""

import argparse
import sys
from pathlib import Path


def phead(input_file: str, output_file: str, num_lines: int, max_bytes: int = None):
    """
    Extract first N lines from input_file and write to output_file.
    If max_bytes is specified, ensures the extracted lines don't exceed this limit.
    
    Args:
        input_file: Path to input file
        output_file: Path to output file  
        num_lines: Number of lines to extract (required)
        max_bytes: Maximum bytes allowed as safety limit (optional)
        
    Raises:
        ValueError: If num_lines would exceed max_bytes limit
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
        
        bytes_written = 0
        lines_written = 0
        
        with open(input_path, 'r', encoding='utf-8') as infile, \
             open(output_path, 'w', encoding='utf-8') as outfile:
            
            for line in infile:
                # Check line limit first
                if lines_written >= num_lines:
                    break
                
                # Check if adding this line would exceed byte limit
                line_bytes = len(line.encode('utf-8'))
                if max_bytes is not None and bytes_written + line_bytes > max_bytes:
                    # Error condition - cannot extract requested lines within byte limit
                    raise ValueError(
                        f"Cannot extract {num_lines} lines: would exceed {max_bytes} byte limit "
                        f"(need {bytes_written + line_bytes} bytes for line {lines_written + 1})"
                    )
                
                # Write the full line
                outfile.write(line)
                bytes_written += line_bytes
                lines_written += 1
        
        return lines_written, bytes_written
        
    except UnicodeDecodeError as e:
        raise ValueError(f"Failed to decode input file as UTF-8: {e}")
    except IOError as e:
        raise IOError(f"File I/O error: {e}")


def main():
    parser = argparse.ArgumentParser(
        description='Extract first N lines from a text file with optional byte limit safety check',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python phead.py --lines 10 input.txt output.txt
  python phead.py -n 5 -c 500 input.txt output.txt  # Error if 5 lines exceed 500 bytes
        """
    )
    
    parser.add_argument(
        '--lines', '-n',
        type=int,
        required=True,
        help='Number of lines to extract (required)'
    )
    
    parser.add_argument(
        '--max-bytes', '-c',
        type=int, 
        help='Maximum bytes allowed (safety limit - errors if lines exceed this)'
    )
    
    parser.add_argument(
        'input_file',
        help='Input text file path'
    )
    
    parser.add_argument(
        'output_file', 
        help='Output text file path'
    )
    
    args = parser.parse_args()
    
    # Validate arguments
    if args.lines < 0:
        print("Error: --lines must be non-negative", file=sys.stderr)
        sys.exit(1)
        
    if args.max_bytes is not None and args.max_bytes < 0:
        print("Error: --max-bytes must be non-negative", file=sys.stderr)
        sys.exit(1)
    
    try:
        lines_written, bytes_written = phead(
            args.input_file, 
            args.output_file,
            args.lines,
            args.max_bytes
        )
        
        print(f"Successfully wrote {lines_written} lines ({bytes_written} bytes) to {args.output_file}")
        
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
