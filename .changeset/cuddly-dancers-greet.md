---
"@milaboratories/pl-client": major
---

Sync pl proto API: resource signing, locks, access control, field renames.

**Breaking changes (proto field renames):**
- `Resource.id` → `Resource.resource_id`
- `ResourceAPI.Remove.Request.id` → `ResourceAPI.Remove.Request.resource_id`
- `FieldAPI.SetError.Request.err_resource_id` → `FieldAPI.SetError.Request.error_resource_id`
- `CacheAPI.DeleteExpiredRecords` deprecated (replaced with `Util.Deprecated`)

**New proto fields — resource signing (color proof):**
- `Resource.resource_signature` — signature for resource ID
- `Field.value_signature`, `Field.error_signature` — signatures for field references
- `resource_signature` added to most request/response messages (Remove, Get, LockInputs, LockOutputs, Exists, SetError, Tree, TreeSize, FieldList, KV operations, Lease)
- `color_proof` added to resource creation requests (CreateStruct, CreateEphemeral, CreateValue, CreateSingleton, CreateRoot)
- `TxAPI.SetDefaultColor` — new TX operation to set default color for resource creation

**New API features:**
- `LocksAPI.LockFieldValues` — optimistic locking for resolved field values
- `ResourceSchema.AccessFlags` — per-resource-type access restrictions for non-controller roles (create, read/write fields, read/write KV, per-field-type overrides)
- `ResourceSchema.free_inputs` / `free_outputs` — skip automatic locking on creation
- `Notification.Events.resource_recovered` — new notification event
- `AuthAPI.GetJWTToken.Role` — request JWT with specific role
- `AuthAPI.GetJWTToken.Response.session_id` — session ID in JWT response
