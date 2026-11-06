---
"@milaboratories/pl-client": patch
---

Recover from a connection loss:

- Use a local gRPC subchannel pool per client. A client created after a connection loss no longer inherits the reconnect backoff of the old client's subchannel, so it connects as soon as the server is reachable.
- Cap the gRPC reconnect backoff at 10 s (default 120 s), so a long-lived client reconnects soon after the server is back.
- Return the connection status from "Disconnected" to "OK" when a gRPC call completes with OK or a REST request succeeds again. The status listener now reports each change between "OK" and "Disconnected".
- Check an UNAUTHENTICATED reply also while the status is "Disconnected", so `onAuthError` fires for a session that expired during an outage. "Unauthenticated" stays final for the client.
