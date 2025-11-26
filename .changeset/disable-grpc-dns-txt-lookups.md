---
"@milaboratories/pl-client": patch
---

Disable gRPC DNS TXT record lookups for service config discovery.

gRPC's DNS resolver queries TXT records at `_grpc_config.<hostname>` to fetch service configuration. This behavior can trigger unexpected network traffic that may concern users monitoring their network activity. Added `grpc.service_config_disable_resolution` option to disable this while maintaining all other gRPC functionality.

