import sys
import os

msg = sys.argv[1] if len(sys.argv) > 1 else "Hello, world"

print(msg)
os.exit(0)
