---
'@platforma-sdk/workflow-tengo': patch
---

- fix for b-query result unmarshaller requiring data to always be available
- macro state definitions for awaitState API: BQueryResultSingle, BQueryResultMulti, BQueryResultMultiNoData, PColumnBundle, PColumnBundleWithPartitions
- anchor columns are now available by their ids in column bundle
- wf.getBlockId() to retrieve string block id
