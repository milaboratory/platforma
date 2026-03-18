---
"@milaboratories/pl-middle-layer": patch
---

Export project model constants and duplicateProject for external consumers

Added public exports:
- `ProjectMetaKey`, `ProjectCreatedTimestamp`, `ProjectLastModifiedTimestamp`, `SchemaVersionKey`, `SchemaVersionCurrent`, `ProjectStructureKey`, `ProjectResourceType`, `BlockArgsAuthorKeyPrefix`, `ProjectStructureAuthorKey` from model
- `ProjectsField` from middle_layer
- `duplicateProject` from mutator/project
