---
"@milaboratories/pl-mcp-server": patch
---

Stop guessing the connection status when the desktop app integration cannot report one. The tool
used to answer from whether a backend handle existed inside its own process — a fact that says
nothing about whether the app holds a server connection — so it could report a connection state it
never observed. It now returns the same unavailable error its neighbour tool already returns for the
identical condition, naming what is unavailable and the next step.
