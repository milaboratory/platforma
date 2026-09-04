---
"@milaboratories/pl-client": minor
---

Added `loginMethods()`, which returns every login method the backend advertises — of every kind, SSO and basic alike — each keeping its own id, description and kind. `beginSSOLogin`, `loginSSO` and `login` now accept an optional method id to route the login to a specific advertised method; omitting it keeps today's first-match behavior. `ssoConfig()` and `supportedAuthSchemes` are deprecated in favor of `loginMethods()` but remain available with their existing shape.
