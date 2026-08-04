---
"@milaboratories/pl-client": patch
"@milaboratories/pl-drivers": patch
"@milaboratories/pl-healthcheck": patch
---

Raise the HTTP/2 connection window to 16 MiB via `grpc-node.flow_control_window`, and bump `@grpc/grpc-js` to 1.14.4 where that option drives the connection-level window and not just the per-stream one. On a high-latency link a large project open was capped at window/RTT instead of link speed.
