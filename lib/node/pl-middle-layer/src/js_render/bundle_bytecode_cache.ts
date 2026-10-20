import { createHash } from "node:crypto";
import type { QuickJSContext } from "quickjs-emscripten";

/** Bytecode budget. A 505 KB bundle compiles to ~1.4 MB, so this holds roughly forty. */
const MAX_BYTES = 64 * 1024 * 1024;

/** Pack id + code length -> bundle digest. Hashing once per pack keeps it off the hot path. */
const digestByCacheKey = new Map<string, string>();
const MAX_DIGEST_ENTRIES = 1024;

/** Insertion-ordered, so the oldest key is the first one `keys()` yields. */
const cache = new Map<string, ArrayBuffer>();

/** Sum of `cache`'s values' byte lengths, kept alongside it to avoid rescanning on evict. */
let heldBytes = 0;

function digestFor(cacheKey: string, code: string): string {
  // Pack resources are immutable (mutator/project.ts creates a new one per update), so the
  // length check only guards that invariant breaking.
  const memoKey = `${cacheKey}:${code.length}`;
  const known = digestByCacheKey.get(memoKey);
  if (known !== undefined) return known;

  const digest = createHash("sha256").update(code).digest("hex");
  digestByCacheKey.set(memoKey, digest);
  while (digestByCacheKey.size > MAX_DIGEST_ENTRIES) {
    const oldest = digestByCacheKey.keys().next();
    if (oldest.done === true) break;
    digestByCacheKey.delete(oldest.value);
  }
  return digest;
}

/** Bytecode for `code`, compiled on first ask. Outlives the context that compiled it. */
function byteCodeFor(vm: QuickJSContext, cacheKey: string, code: string): ArrayBuffer {
  const digest = digestFor(cacheKey, code);
  const hit = cache.get(digest);
  if (hit !== undefined) {
    // Refresh recency: delete then set moves the key to the end of the iteration order.
    cache.delete(digest);
    cache.set(digest, hit);
    return hit;
  }

  const compiled = vm
    .unwrapResult(vm.compileToByteCode(code, "bundle.js", { type: "global" }))
    .consume((handle) =>
      vm.getArrayBuffer(handle).consume((buf) => new Uint8Array(buf.value).buffer),
    );

  cache.set(digest, compiled);
  heldBytes += compiled.byteLength;
  while (heldBytes > MAX_BYTES && cache.size > 1) {
    const oldest = cache.keys().next();
    if (oldest.done === true) break;
    heldBytes -= cache.get(oldest.value)?.byteLength ?? 0;
    cache.delete(oldest.value);
  }
  return compiled;
}

/** Evaluate a block's model bundle into `vm`, reusing bytecode compiled for `cacheKey`. */
export function evaluateBundleCached(vm: QuickJSContext, cacheKey: string, code: string): void {
  const byteCode = byteCodeFor(vm, cacheKey, code);
  // Not `consume`: it disposes only on a clean return, so a throwing bundle leaks the handle.
  const handle = vm.newArrayBuffer(byteCode);
  try {
    vm.unwrapResult(vm.evalByteCode(handle)).dispose();
  } finally {
    handle.dispose();
  }
}

/** Drops every compiled bundle. Exported for tests. */
export function clearBundleByteCodeCache(): void {
  cache.clear();
  digestByCacheKey.clear();
  heldBytes = 0;
}

/** Number of compiled bundles currently held. Exported for tests. */
export function bundleByteCodeCacheSize(): number {
  return cache.size;
}

/** Bytes of bytecode currently held. Exported for tests and diagnostics. */
export function bundleByteCodeCacheBytes(): number {
  return heldBytes;
}
