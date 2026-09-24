---
"@platforma-open/milaboratories.software-ptabler": patch
---

Size the DuckDB memory limit of the `write_frame` sort from the free memory. The DuckDB default is 80% of the memory it detects (the cgroup limit or the RAM). It ignores the memory that the Polars phase still holds, so the process was OOM-killed in the sort. On Linux, the limit is now 70% of the detected memory minus the resident size of the process, never below 16 MiB, and never above the DuckDB default. On macOS and Windows the DuckDB default stays.
