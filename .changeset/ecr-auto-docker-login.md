---
"@platforma-sdk/package-builder-lib": minor
"@platforma-sdk/block-tools": minor
---

Automate the dev docker login for `block-tools software build` (A-0044). A push target written as
`ecr://<host>/<repo>` triggers an automatic ECR `docker login` before the push; a plain `https://`
or bare host opts out. The built-in dev default push target now uses the `ecr://` form, so dev push
logs in by default. The scheme is stripped for the actual tag/push and for the descriptor's embedded
pull address.

The login token is fetched via the AWS SDK (`@aws-sdk/client-ecr-public`), reusing the same default
credential chain as the S3 binary upload — environment variables first (CI), else the SSO profile
(local). `AWS_PROFILE` is selected once, process-wide (`PL_AWS_PROFILE` override, default
`research-poweruser`), so docker login and S3 upload use identical credentials. Login runs
unconditionally (idempotent, ~1s): an expired or absent session fails at login with a clear
`aws sso login` hint rather than surfacing an opaque error at push time. Public ECR is the only
auto-login target. The build engine and `pl-pkg` are untouched — login lives in the block-tools
layer.
