import { test, expect, beforeEach } from "vitest";
import { getQuickJS, type QuickJSContext, type QuickJSRuntime } from "quickjs-emscripten";
import {
  bundleByteCodeCacheBytes,
  bundleByteCodeCacheSize,
  clearBundleByteCodeCache,
  evaluateBundleCached,
} from "./bundle_bytecode_cache";

const QuickJS = await getQuickJS();

/** A context with the same limits `computableFromRF` applies, disposed by the caller. */
function newContext(): { runtime: QuickJSRuntime; vm: QuickJSContext } {
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(1024 * 1024 * 8);
  runtime.setMaxStackSize(1024 * 320);
  return { runtime, vm: runtime.newContext() };
}

function withContext<T>(block: (vm: QuickJSContext) => T): T {
  const { runtime, vm } = newContext();
  try {
    return block(vm);
  } finally {
    vm.dispose();
    runtime.dispose();
  }
}

const readNumber = (vm: QuickJSContext, expression: string): number =>
  vm.unwrapResult(vm.evalCode(expression)).consume((handle) => vm.getNumber(handle));

beforeEach(() => clearBundleByteCodeCache());

test("bytecode compiled for one context evaluates in another, after the first is gone", () => {
  const code = `globalThis.answer = 42`;

  withContext((vm) => evaluateBundleCached(vm, "k", code));
  expect(bundleByteCodeCacheSize()).toBe(1);

  // The context that compiled the bundle is disposed by now, so a hit here proves the
  // cached bytes outlive the context they came from.
  withContext((vm) => {
    evaluateBundleCached(vm, "k", code);
    expect(readNumber(vm, "globalThis.answer")).toBe(42);
  });
  expect(bundleByteCodeCacheSize()).toBe(1);
});

test("a cache hit does not carry state between contexts", () => {
  const code = `globalThis.counter = (globalThis.counter ?? 0) + 1`;

  withContext((vm) => {
    evaluateBundleCached(vm, "k", code);
    expect(readNumber(vm, "globalThis.counter")).toBe(1);
    // Mutating here must not be visible to the next context.
    vm.unwrapResult(vm.evalCode(`globalThis.counter = 99`)).dispose();
  });

  withContext((vm) => {
    evaluateBundleCached(vm, "k", code);
    expect(readNumber(vm, "globalThis.counter")).toBe(1);
  });
});

test("a different key compiles separately rather than reusing the first bundle", () => {
  withContext((vm) => evaluateBundleCached(vm, "a", `globalThis.v = 1`));
  withContext((vm) => {
    evaluateBundleCached(vm, "b", `globalThis.v = 2`);
    expect(readNumber(vm, "globalThis.v")).toBe(2);
  });
  expect(bundleByteCodeCacheSize()).toBe(2);
});

test("a bundle that fails to compile throws and is not cached", () => {
  withContext((vm) => {
    expect(() => evaluateBundleCached(vm, "bad", `this is ( not js`)).toThrow();
  });
  expect(bundleByteCodeCacheSize()).toBe(0);
});

test("a bundle that throws while running is not cached as a failure", () => {
  // Compilation succeeds, execution does not. The bytes are valid either way, so the entry
  // stays: the failure belongs to the run, not to the compiled bundle.
  withContext((vm) => {
    expect(() => evaluateBundleCached(vm, "boom", `throw new Error("boom")`)).toThrow();
  });
  expect(bundleByteCodeCacheSize()).toBe(1);
});

test("two blocks on the same pack share one compiled bundle", () => {
  const code = `globalThis.shared = 1`;

  // Distinct keys: block pack ids are per resource, so two blocks on the same pack version
  // arrive here under different keys with identical code.
  withContext((vm) => evaluateBundleCached(vm, "pack-resource-a", code));
  const afterFirst = bundleByteCodeCacheBytes();
  withContext((vm) => evaluateBundleCached(vm, "pack-resource-b", code));

  expect(bundleByteCodeCacheSize()).toBe(1);
  expect(bundleByteCodeCacheBytes()).toBe(afterFirst);
});

test("the same key with a differently sized bundle recompiles", () => {
  withContext((vm) => {
    evaluateBundleCached(vm, "k", `globalThis.v = 1`);
    expect(readNumber(vm, "globalThis.v")).toBe(1);
  });
  withContext((vm) => {
    evaluateBundleCached(vm, "k", `globalThis.v = 22222`);
    expect(readNumber(vm, "globalThis.v")).toBe(22222);
  });
});

test("clearing the cache forces a recompile rather than returning stale bytes", () => {
  withContext((vm) => evaluateBundleCached(vm, "k", `globalThis.v = 1`));
  expect(bundleByteCodeCacheSize()).toBe(1);

  clearBundleByteCodeCache();
  expect(bundleByteCodeCacheSize()).toBe(0);

  // Same key, different code: a stale hit would leave v at 1.
  withContext((vm) => {
    evaluateBundleCached(vm, "k", `globalThis.v = 2`);
    expect(readNumber(vm, "globalThis.v")).toBe(2);
  });
});
