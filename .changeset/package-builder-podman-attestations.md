---
"@platforma-sdk/package-builder-lib": patch
"@platforma-sdk/package-builder": patch
"@platforma-sdk/block-tools": patch
---

Make software docker image builds work when `docker` is podman. Replace `--provenance=false --sbom=false` with `BUILDX_NO_DEFAULT_ATTESTATIONS=1` in the `docker build` environment. Docker buildx output does not change: the default provenance attestation stays off and SBOM is off by default. Podman rejects both flags and ignores the variable.
