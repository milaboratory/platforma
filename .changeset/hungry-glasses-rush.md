---
'@milaboratories/pl-drivers': patch
'@milaboratories/pl-client': patch
---

Fix for closed channel error. All gRPC clients are now used via GrpcClientProvider to refresh underlying transport.
