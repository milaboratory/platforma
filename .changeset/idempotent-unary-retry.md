---
"@milaboratories/pl-client": patch
---

Retry the connect-path ping and `getUserRoot` on transient transport failures (unreachable peer, elapsed deadline), bounded to 4 attempts. A single blip during DNS or load-balancer warm-up previously failed the whole connect. Real server answers such as auth and permission errors are never retried.
