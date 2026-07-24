---
"@milaboratories/ts-builder": patch
"@milaboratories/build-configs": patch
"@platforma-sdk/ui-vue": patch
---

Support TypeScript 7 (the native compiler) across the build toolchain.

TS7 no longer exposes the classic JS Compiler API that Volar-based tooling
requires, so:

- ts-builder runs `vue-tsc` against the official `@typescript/typescript6`
  bridge, passes a TS7-compatible `--customConditions` value (a bare `,` is
  parsed as a source file on TS7), provides an explicit `fs` to
  `@vue/compiler-sfc` (`ts.sys` is gone on TS7), and uses `Bundler`
  `moduleResolution` for declaration emit.
- build-configs provides the same explicit `fs` to the vitest Vue config so
  SFC-compiling tests pass on TS7.
- ui-vue's `AnnotationsSidebar`/`FilterSidebar` title/label handlers accept
  `string | undefined`, matching `PlEditableTitle`'s model emit type.
