# ptabler Quick Commands for LLM

## Run Single Test
```bash
cd software/src
PYTHONPATH=. ../.venv/bin/python -m unittest test.basic_test -v
```
Replace `test.basic_test` with: `test.expression_tests`, `test.aggregation_test`, `test.join_test`, etc.

## Run All Tests  
```bash
cd software
.venv/bin/python -m unittest discover --verbose -s src -p '*test*.py'
```

## Execute Python Code String
```bash
cd software/src
PYTHONPATH=. ../.venv/bin/python -c "
import polars as pl
from ptabler.workflow import PWorkflow
# Your code here
"
```

**Key**: Always use `PYTHONPATH=.` from `software/src` directory. Polars, polars-hash, ptabler modules available.
