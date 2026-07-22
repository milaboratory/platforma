---
"@milaboratories/pl-model-common": patch
"@milaboratories/pf-spec-driver": patch
"@milaboratories/pf-driver": patch
"@platforma-sdk/model": patch
---

PFrames update: add Limit query node. createPlDataTableV3 caps results at 50k
rows when the runtime supports the pFrameQueryLimitSupport feature flag.
