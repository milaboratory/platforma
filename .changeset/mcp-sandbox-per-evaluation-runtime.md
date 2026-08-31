---
"@milaboratories/pl-mcp-server": patch
---

Give each sandbox evaluation its own QuickJS runtime, deadline, memory limit and stack cap, and dispose both context and runtime when it ends. Two evaluations starting together no longer build a runtime each and abandon one undisposed, and no evaluation's bound is reachable from another. Each evaluation now gets the full 16 MB and 320 KB rather than a share of one budget.
