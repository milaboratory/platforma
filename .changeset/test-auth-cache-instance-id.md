---
"@milaboratories/pl-client": patch
---

Fix stale-JWT flake in test helper. `TestHelpers.getTestClient` cached the
backend's JWT for 24h keyed on address/user/password, but ignored
`MaintenanceAPI.Ping.Response.instanceId`. A backend restart that rotated
`instanceId` invalidated every previously-issued JWT (the validator
rejects tokens whose `iss` claim doesn't match the live instance) while
leaving the cache file's other validity checks satisfied. Concurrent test
files loaded the dead JWT and failed the first authenticated call with
`failed to authenticate request using any of available methods` before
`onAuthError` cleared the cache for the next attempt. The cache now
captures `instanceId` at issue time and compares it against the live
ping response on load.
