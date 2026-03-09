---
"@milaboratories/pl-middle-layer": patch
---

Fix staging rendering for blocks without prerunArgs (e.g. samples-and-data). Blocks that don't define prerunArgs never get stagingCtx, which broke all downstream staging. Now createStagingCtx falls back to prodCtx for such upstreams, and renderStagingFor skips without clearing existing staging.
