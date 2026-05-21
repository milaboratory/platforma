---
'@milaboratories/pl-client': minor
---

Add SSO login surface to `UnauthenticatedPlClient`: `ssoConfig()` projects the first advertised `SSOAuthMethod` from `authMethodsSync`, `beginSSOLogin()` requests a one-time PKCE nonce, and `loginSSO({ tokenResponse })` exchanges the IdP `/token` response for a Platforma JWT. New exported types: `SSOAuthMethod`, `SSOLoginAttempt`, `SSOFlowType`. Mirrors the spec in `text/work/projects/sso-and-access-control/parameterization.md`.
