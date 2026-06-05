# @milaboratories/pl-healthcheck

## 1.0.1

### Patch Changes

- Updated dependencies [8cbe874]
  - @milaboratories/ts-helpers@1.8.3

## 1.0.0

### Major Changes

- 8d93fdf: Proper platforma backend readiness checks.

  `LocalPl.isAlive` is split into two polling/throwing methods:

  - `isAlive(opts?)` — waits for the OS process to be alive.
  - `isReady(opts?)` — waits for `grpc.health.v1.Health/Check` to report SERVING; requires `grpcPort` to be configured and throws if it isn't.
