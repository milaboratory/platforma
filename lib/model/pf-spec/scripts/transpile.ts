/**
 * This script transpiles the pframes spec-plane WASM component. It writes the JS
 * bindings to `src/generated`.
 *
 * The script gets the component through the `wasm` export condition of
 * `@milaboratories/pframes-rs-wasip2`. Therefore the npm script passes
 * `node --conditions=wasm`.
 */

import { transpile, writeFiles } from "@bytecodealliance/jco-transpile";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(import.meta.dirname, "../src/generated");

function resolveComponent(): string {
  try {
    return fileURLToPath(import.meta.resolve("@milaboratories/pframes-rs-wasip2"));
  } catch (err) {
    throw new Error(
      `Could not resolve the pframes WASM component. Is ` +
        `@milaboratories/pframes-rs-wasip2 installed, and was node given ` +
        `--conditions=wasm?`,
      { cause: err },
    );
  }
}

const component = resolveComponent();

await rm(outDir, { recursive: true, force: true });

const { files } = await transpile(component, {
  name: "pframes_rs_wasip2",
  outDir,
  namespacedExports: false,
});
await writeFiles(files);

console.log(`transpiled pframes WASM bindings into ${outDir}`);
