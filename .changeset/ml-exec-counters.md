---
"@milaboratories/pl-middle-layer": patch
---

`MiddleLayer.execCounters` reports model bundle evaluations and callbacks by lambda and transactions by name since start, and `execCountersDelta` subtracts two readings. With `MI_LOG_EXEC_COUNTERS` set, the middle layer logs one `[exec-counters]` line every 10 seconds with the transactions by name and outcome and the model VMs by lambda run since the previous line, and logs nothing for a period with no work.
