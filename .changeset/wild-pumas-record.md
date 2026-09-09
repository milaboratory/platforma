---
"@milaboratories/pl-flight-recorder": minor
"@milaboratories/pl-middle-layer": patch
---

Add a crash-survivable flight recorder for the block model layer.

Records every join a block model builds and every row it reads back, so an
out-of-memory death that leaves no other trace can be explained after the fact:
which block, which join, which call was in flight, and which memory region ran
out. Records are appended synchronously because the process being observed dies
without running any shutdown path, and an out-of-band sampler thread keeps the
resident-memory curve intact while the observed thread is blocked.

Join trees are reduced to a redacted digest — schema, row and byte counts, never
values — and two structural faults are detected from specs alone, before any data
is read: join siblings that share no axis, and axes that agree on name and type
but disagree on domain.

Recording is opt-in: it is enabled by pointing `MI_FLIGHT_RECORDER_DIR` at a
directory, and is inert otherwise.
