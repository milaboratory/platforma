---
"@milaboratories/pl-crash-recorder": patch
---

Say once what a platform cannot measure, and say what that is. A Windows session carried thirty-four copies of "not implemented for win32" in thirty-five seconds — a line naming neither what is missing nor where to find it, repeated until it buried the memory curve it sat beside. The reason is now recorded on the first sample only: it names the figures that cannot be taken there, why (vm_stat and sysctl are macOS-only, /proc/meminfo Linux-only), and points at the per-process private bytes the host log carries instead. A source that fails outright is treated the same way — recorded once, not retried.
