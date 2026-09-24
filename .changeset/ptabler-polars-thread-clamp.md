---
"@platforma-sdk/workflow-tengo": patch
---

ptabler runs clamp `POLARS_MAX_THREADS` to 8, whatever cpu the run is granted. The auto-sized RAM request is calibrated at 8 Polars threads; above 12 threads a run could need more than it was granted.
