# Description

This directory contains docker-compose that helps to boot platforma backend that is reachable only via HTTP proxy.

It is useful to test proxy support in pl-client and pl-drivers.

# How-to

```bash
cd lib/node/pl-client/proxy-test/
docker compose up
```

```bash
cd lib/node/pl-client/
PL_ADDRESS="http://platforma:6347?grpc-proxy=http://127.0.0.1:8080/&http-proxy=http://127.0.0.1:8080/" \
  pnpm test
```
