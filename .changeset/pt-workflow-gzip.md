---
"@platforma-sdk/workflow-tengo": patch
"@platforma-open/milaboratories.software-ptabler": minor
---

pt.run() sends the ptabler workflow as gzip-compressed JSON. A workflow with many steps (for example, one frame for each sample) can be larger than the 4 MiB gRPC message limit of the platform. Before this change, such a workflow failed with "grpc: received message larger than max". On a backend without gzipEncode, pt.run() sends plain JSON as before. ptabler reads a workflow file with a ".gz" suffix (for example, "workflow.json.gz") as gzip-compressed.
