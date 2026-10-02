---
"@milaboratories/ts-builder": minor
---

Add `NO_SOURCEMAPS=1` to build without JavaScript source maps. Production builds embed the original TypeScript in `.js.map` (`sourcesContent`); release builds can now leave it out while local builds keep the maps. Applies to browser, node and block builds; node and block model/kind/facade builds also drop `.d.ts.map` (which holds no source). Unset, behavior is the same as before.
