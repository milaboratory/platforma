---
"@milaboratories/pl-client": major
---

Sync pl proto API: resource signing, access control, locks, auth, field renames.

**Breaking changes:**

Proto field renames:
- `Resource.id` → `Resource.resource_id`
- `ResourceAPI.Remove.Request.id` → `ResourceAPI.Remove.Request.resource_id`
- `FieldAPI.SetError.Request.err_resource_id` → `FieldAPI.SetError.Request.error_resource_id`

Proto field removals:
- `MaintenanceAPI.Ping.Response.server_info` removed (field 3)

Proto deprecations:
- `CacheAPI.DeleteExpiredRecords` replaced with `Util.Deprecated` placeholder

Lease endpoint URL changes:
- `/v1/locks/lease` → `/v1/locks/lease/create`
- `PUT /v1/locks/lease` → `POST /v1/locks/lease/update`
- `DELETE /v1/locks/lease` → `POST /v1/locks/lease/release`

**New proto fields — resource signing:**

Core messages:
- `Resource.resource_signature` (bytes) — opaque signature for resource ID
- `Field.value_signature` (bytes) — signature for field value resource, inheriting parent color
- `Field.error_signature` (bytes) — signature for error resource, inheriting parent color
- `FieldRef.resource_signature` (bytes) — signature for the referenced resource

Transaction operations:
- `TxAPI.SetDefaultColor` — set default color for resource creation via `color_proof`

Resource creation — `color_proof` added to:
- `CreateStruct.Request`, `CreateEphemeral.Request`, `CreateValue.Request`, `CreateSingleton.Request`

Resource creation — `resource_signature` added to responses:
- `CreateStruct`, `CreateEphemeral`, `CreateValue`, `CreateSingleton`, `CreateRoot`, `GetValueID`

Resource access — `resource_signature` added to requests:
- `Remove`, `Get`, `LockInputs`, `LockOutputs`, `Exists`, `SetError` (+ `error_resource_signature`), `Tree`, `TreeSize`, `Name.Set`

Resource access — `resource_signature` added to responses:
- `Name.Get`

Field operations — `resource_signature` added to:
- `FieldAPI.List.Request`, `FieldAPI.SetError.Request` (`error_resource_signature`)

KV operations — `resource_signature` added to all `ResourceKVAPI.*.Request`:
- `Set`, `Get`, `GetIfExists`, `Delete`, `SetFlag`, `GetFlag`, `List`

Lease operations — `resource_signature` added to:
- `Lease.Create.Request`, `Lease.Update.Request`, `Lease.Release.Request`

**New API — access control:**

RPCs:
- `GrantAccess` — grant resource access to another user
- `RevokeGrant` — revoke previously granted access
- `ListGrants` — server-side streaming, list grants for a resource
- `ListUserResources` — server-side streaming, user root + shared resources with pagination

Messages:
- `AuthAPI.Grant` — grant record (user, resource_id, permissions, granted_by, granted_at)
- `AuthAPI.Grant.Permissions` — access bitmask (writable)
- `AuthAPI.ListUserResources.UserRoot` — signed user root
- `AuthAPI.ListUserResources.SharedResource` — signed shared resource with type and permissions

**New API — auth:**

- `AuthAPI.GetJWTToken.Role` enum — `ROLE_UNSPECIFIED`, `USER`, `CONTROLLER`, `WORKFLOW`
- `AuthAPI.GetJWTToken.Request.requested_role` — request JWT with specific role
- `AuthAPI.GetJWTToken.Response.session_id` — 128-bit session ID

**New API — locks:**

- `LocksAPI.LockFieldValues` — optimistic locking on resolved field values

**New API — schema:**

- `ResourceSchema.AccessFlags` — per-type access restrictions for non-controller roles (create_resource, read_fields, write_fields, read_kv, write_kv, per-field-type overrides via read_by_field_type/write_by_field_type maps)
- `ResourceSchema.free_inputs` / `free_outputs` — skip automatic locking on creation

**New API — notifications:**

- `Notification.Events.resource_recovered` — new event type

**New utility:**

- `Util.Deprecated` — empty message for deprecated oneOf slots
