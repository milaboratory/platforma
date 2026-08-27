---
"@milaboratories/ts-builder": patch
"@platforma-sdk/ui-vue": patch
"@milaboratories/uikit": patch
---

Restore emission of `*.vue.d.ts` declarations in browser-lib builds.

vite-plugin-dts 5 auto-detects whether to run its Vue program processor, but its detector only scans two directory levels below the package root. Our SFCs live deeper (`src/components/**`), so it fell back to the plain TypeScript processor and silently emitted no `*.vue.d.ts` — while `dist/lib.d.ts` still re-exported those `.vue` specifiers, breaking any consumer that resolves them (e.g. block model facade builds). ts-builder now picks the processor itself.
