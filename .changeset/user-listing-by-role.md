---
"@milaboratories/pl-client": minor
"@milaboratories/pl-middle-layer": minor
"@platforma-sdk/pl-cli": patch
---

Support user listing that the server controls per client role (`userListing:v2`).

- pl-client: `PlClient.canListUsers` tells if the authenticated user can list users. On a `userListing:v2` backend it reads `GetSessionInfo.can_list_users`; on a `userListing:v1` backend it is true. `GetSessionInfo` responses carry `canListUsers`.
- pl-client: the protocol definitions are synced with the backend. `MaintenanceAPI_Ping_Response.requiredCapabilities` is renamed to `requiredClientCapabilities`, as in the backend proto.
- pl-middle-layer: `MiddleLayer.userListingAvailable` selects the recipient picker or paste-a-login UI.
- pl-cli: `admin user-list` tells clearly when the server does not let the user list users.
