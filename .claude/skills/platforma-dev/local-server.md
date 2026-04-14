# Running a local platforma server

Integration tests (both in the platforma monorepo and in standalone blocks) require a running platforma backend.

Use `/run-backend` skill to get the binary, configure the license, and start the server.

## Server requirements

When starting the server, provide these additional settings:
- attach the monorepo's `assets/` directory as an FS data library named `library` (test fixtures live there)
- enable debug API

## Test environment variables

Tests need these environment variables:

```bash
export PL_ADDRESS=http://127.0.0.1:6345
export PL_TEST_USER=default
export PL_TEST_PASSWORD=<TOKEN>    # the auth token from server startup output
```

`PL_*` variables above are passed through to test processes via turbo's `passThroughEnv` configuration.
