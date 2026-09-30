# @milaboratories/pl-flight-recorder

## 0.3.3

### Patch Changes

- Updated dependencies [cadf144]
  - @milaboratories/pl-model-common@1.51.0

## 0.3.2

### Patch Changes

- Updated dependencies [3716dcb]
  - @milaboratories/pl-model-common@1.50.0

## 0.3.1

### Patch Changes

- 6bb6c70: Hand out the file a crash marker was read from. The one record the parent contributes — the reason the child died, and memory at the moment it stopped answering — reached a report only if the consumer spelled the file name itself, which is how the rename to `death-` dropped it. `readCrashMarkers` now returns the path beside each marker, so the name is spelled in one place.
- 6f5690c: Say once what a platform cannot measure, and say what that is. A Windows session carried thirty-four copies of "not implemented for win32" in thirty-five seconds — a line naming neither what is missing nor where to find it, repeated until it buried the memory curve it sat beside. The reason is now recorded on the first sample only: it names the figures that cannot be taken there, why (vm_stat and sysctl are macOS-only, /proc/meminfo Linux-only), and points at the per-process private bytes the host log carries instead. A source that fails outright is treated the same way — recorded once, not retried.

## 0.3.0

### Minor Changes

- f91337f: Collect evidence about a crash; stop drawing conclusions from it.

  - Remove the rendered report, the verdict, and the analysis behind them. `renderReport`, `Verdict`, `Finding`, `analyzeSession` and the rules that read a definition are gone. What a crash means needs the block's intent and usually a reproduction, neither of which the crashing machine has; a conclusion shipped from it would be read as the answer. The package now records and nothing else — ~1100 lines of reading code no longer travel inside the application that produced the logs. Reading them is a workspace tool, in the `platforma-logs` skill.
  - Cover the recording guarantees directly rather than through a reader: that a killed session is detectable, that rotation carries the header, the earliest memory reading, the open begins and the sticky records, that a driver call records the block whose render made it, and that no value from a definition reaches the log.
  - Sample where the machine's memory actually is, not only what is resident. A process under pressure has its pages moved into the macOS compressor or out to swap, so resident size falls while the memory it asked for is still held — which made a peak of 17 GiB out of a run that a task manager showed at 46 GB. Each sampler record now carries the kernel's own high-water resident mark, and once a second the compressor, swap, anonymous, file-backed and wired totals.
  - Name the operations that overlapped each completed one. A resident-size delta measures the whole process over an interval, so a 28 ms render that ran inside an unfinished native call was being credited with gigabytes it never touched. The overlap is reported; whether it invalidates a delta is left to the reader.
  - Record what the definition asked for: rows the outermost join can produce, the size of that result from its value types, and the axes its sides do and do not share. Where a type does not fix a width the size is a range.
  - Carry the block a driver call was made under on the operation itself, and say when a crash marker could belong to more than one session instead of attaching it to a guess.
  - Say which code was running. A block id is unique to one project and names nothing on its own, so each block now writes what it actually is — package, version, source and the SDK it was built against — once per session, and the analysis resolves every id against that. Driver calls record the block whose render made them while that render is open, rather than having it reconstructed from sequence numbers afterwards; a call the block's UI makes long after every render returned, which is the case that matters, inherits the block from the call that created the table it operates on. Each attribution says which of the three it came from.
  - Count distinct axis values for inline columns, so a join's size is a number rather than a ceiling. The bound is reached only when every record shares one key; the counts say how many keys there are. Reported alongside the bound, with the size the inputs give if spread evenly over them.
  - Record memory beside the crash marker. `worker-exit` with exit code 1 and an empty stderr reads like an ordinary application error; the parent's resident size, the kernel's high-water mark and the machine's compressor and swap totals, taken at the moment the death was seen, are what say otherwise.
  - Add a host sampler: a sibling log the application process writes, carrying what only it can measure. Resident size falls when the OS compresses or pages a process out, so on its own it cannot separate memory released from memory moved — and on Windows there is no machine-wide compressor figure to read it against. Private bytes settle it, and a per-process breakdown says which of the application's processes holds them. Its own file, because the session log belongs to another thread with its own descriptor and sequence. The reading is supplied by the caller, so this package stays free of the application framework it comes from.
  - Keep the whole tail: memory samples are dropped before the last records are cut, not after, so a session that died inside one long native call no longer yields an empty tail.

## 0.2.1

### Patch Changes

- Updated dependencies [e8f26d6]
  - @milaboratories/pl-model-common@1.49.0

## 0.2.0

### Minor Changes

- f532ce7: Add a crash-survivable flight recorder for the block model layer.

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
