---
"@platforma-sdk/workflow-tengo": major
---

Every exec must state its CPU and RAM requests: `.cpu()` and `.mem()`, or `.resources({ cpu, ram })`
with numbers or formulas. An exec that leaves either out is refused when the workflow is rendered
("exec.builder: a cpu request is required" / "a ram request is required"), instead of running on its
queue's defaults (16 cores and 32 GiB on the heavy queue), which fit no command in particular. The
block run telemetry shows what a command really uses. A zero RAM or VRAM size string (`.mem("0GiB")`)
is refused the same way.
