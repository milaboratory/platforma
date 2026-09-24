---
"@milaboratories/pl-middle-layer": patch
---

Make the project list tolerant of anything that is not a project, and sort it correctly.

The reader walked every dynamic field on the projects resource and read project metadata off each one, so a single sibling of another type — or a project whose metadata had not synced yet — threw inside the computable and took the user's whole project list down. Such an entry is now skipped; the reads stay watched, so it appears as soon as it syncs.

**Visible change:** the sort comparator was called with one argument, so the intended most-recent-first ordering never happened and the list came back in field order. It now orders by last-modified, newest first. Consumers that re-sorted client-side to compensate will see the same order; consumers that relied on what the middle layer returned will see it change.
