---
"@platforma-open/milaboratories.software-ptabler": patch
---

The DuckDB memory limit no longer shrinks when the input file is in the page cache. The resident size it subtracts is now `RssAnon + RssShmem` from `/proc/self/status`, falling back to `VmRSS` where those are absent. `VmRSS` also counts the page-cache pages of mapped files, which are reclaimable. With a hot input, those pages pushed the limit down to its 16 MiB floor, so an import failed at a memory limit that it passed when the file was cold. The log line now lists the RSS components.
