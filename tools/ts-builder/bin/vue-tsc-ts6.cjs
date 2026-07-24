#!/usr/bin/env node
// Run vue-tsc against the classic-API TypeScript 6 compiler.
//
// TypeScript 7 is the native (Go) compiler and ships no embeddable JS Compiler
// API, which Volar / vue-tsc require to type-check `.vue` single-file components.
// Microsoft's official transition path is the `@typescript/typescript6` package
// (the classic API packaged from typescript@6). vue-tsc >= 3.3.x detects this
// alias and redirects tsc to its bundled TS6 (`@typescript/old`).
//
// vue-tsc's bin calls `run()` with no arguments, which eagerly evaluates
// `require.resolve('typescript/lib/tsc')` and throws on TS7 before the redirect
// can run. So we call `run()` ourselves, passing typescript6's tsc explicitly.
//
// See vuejs/language-tools#5381 and the TypeScript 7.0 release notes.
const path = require("node:path");

const ts6PkgJson = require.resolve("@typescript/typescript6/package.json");
const ts6Tsc = path.join(path.dirname(ts6PkgJson), "lib", "tsc.js");

require("vue-tsc").run(ts6Tsc);
