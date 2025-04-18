#!/usr/bin/env python3
"""
convert.py

Usage:
    python convert.py path/to/input.md path/to/output.html

This is a tiny Python wrapper that calls our convert.js node script for us.
"""
import sys
import subprocess
import os

def main():
    if len(sys.argv) < 3:
        print("Usage: python convert.py <input.md> <output.html>")
        sys.exit(1)

    input_md = sys.argv[1]
    output_html = sys.argv[2]

    # Make sure the Node.js script is in the same folder as convert.py:
    script_path = os.path.join(os.path.dirname(__file__), "convert.js")

    # Run: node convert.js input.md output.html
    cmd = ["node", script_path, input_md, output_html]
    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)
    print("Conversion completed!")

if __name__ == "__main__":
    main()
