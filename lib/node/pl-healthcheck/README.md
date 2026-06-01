# @milaboratories/pl-healthcheck

Thin TypeScript client for the standard [gRPC health checking protocol](https://github.com/grpc/grpc/blob/master/doc/health-checking.md)
(`grpc.health.v1.Health`) exposed by the Platforma backend.

## Usage

```ts
import { PlHealthClient, ServingStatus } from "@milaboratories/pl-healthcheck";

const client = PlHealthClient.build({ address: "127.0.0.1:6345" });

// Single Check
const status = await client.check();
if (status === ServingStatus.SERVING) {
  // backend is ready
}

// Poll until SERVING (or timeout)
const ok = await client.waitServing(30_000);

client.close();
```

## Regenerating the proto

```
pnpm run update-proto
```

The proto under `proto/grpc/health/v1/health.proto` is the canonical upstream
file from the gRPC project.
