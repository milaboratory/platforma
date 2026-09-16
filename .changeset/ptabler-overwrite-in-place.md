---
"@platforma-open/milaboratories.software-ptabler": patch
---

Writing a table back over the file it was read from no longer crashes.

The read is lazy, so sinking straight to the target truncated a file polars was still reading. A local filesystem hides that behind cached pages; a network filesystem does not, and the process died with a bus error. A write to a file the same workflow also reads now lands in a sibling temporary file that is moved into place once every sink has been collected, carrying the target's mode across so a file staged writable stays writable. Every other write keeps the direct sink it always had.
