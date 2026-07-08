---
"@platforma-sdk/package-builder-lib": minor
---

Add a built-in `midev` binary upload endpoint for dev push — `DEV_BINARY_UPLOAD_TARGET`
(`s3://milab-midev-registry?region=eu-central-1`), the binary counterpart of the `ecr://` dev docker
default. `block-tools software build --channel dev --location remote` now uploads the binary to the
built-in midev registry with zero config, and the descriptor embeds the `midev` registry name (the
backend resolves it to `bin-dev.pl-open.science`). `PL_DEV_BINARY_UPLOAD_URL` overrides the endpoint
and flips the embedded registry name `midev` → `dev`.
