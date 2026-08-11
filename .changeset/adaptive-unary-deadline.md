---
"@milaboratories/pl-client": patch
---

Derive the unary gRPC deadline from the observed round-trip time instead of a fixed 5s, and give login/refresh their own 120s deadline. On a high-latency link the fixed 5s aborted connect and login outright; the derived deadline is floored by the configured value, so fast links are unaffected.
