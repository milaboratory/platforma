---
"@milaboratories/pl-healthcheck": major
"@milaboratories/pl-deployments": major
---

Proper platforma backend readiness checks.

`LocalPl.isAlive` is split into two polling/throwing methods:

- `isAlive(opts?)` — waits for the OS process to be alive.
- `isReady(opts?)` — waits for `grpc.health.v1.Health/Check` to report SERVING; requires `grpcPort` to be configured and throws if it isn't.
