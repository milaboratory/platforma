---
"@milaboratories/pl-middle-layer": patch
"@milaboratories/pl-mcp-server": patch
---

Take the quickjs-emscripten fork from npm.platforma.bio as `@milaboratories-poc/quickjs-emscripten`, replacing the GitHub release URL that pnpm 12 refuses as a subdependency. Consumers map the `@milaboratories-poc` scope to https://npm.platforma.bio/ in their `.npmrc`.
