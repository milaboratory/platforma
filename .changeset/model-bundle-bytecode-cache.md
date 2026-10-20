---
"@milaboratories/pl-middle-layer": patch
---

Compile each block's model bundle to QuickJS bytecode once and reuse it across the contexts that render the block's lambdas, instead of parsing the bundle per lambda. Needs the bytecode API added in quickjs-emscripten 0.32.1-bytecode.1.
