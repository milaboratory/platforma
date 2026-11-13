---
"@milaboratories/pl-client": minor
---

Refuse a backend that requires client capabilities this client does not implement. The backend
lists them in `MaintenanceAPI.Ping.Response.required_capabilities`; `LLPlClient.build()` checks the
list right after the first Ping and throws `ClientUpdateRequiredError` before any other request.
The client implements no client capabilities yet (`supportedClientCapabilities()`).
