import type { BlockCodeWithInfo, ConfigRenderLambda } from "@platforma-sdk/model";
import type { QuickJSWASMModule } from "quickjs-emscripten";
import { getQuickJS } from "quickjs-emscripten";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { WarmModelVms } from "./index";

function code(callbacks: Record<string, string>): BlockCodeWithInfo {
  const content = Object.entries(callbacks)
    .map(([k, body]) => `globalThis.cfgRenderCtx.callbackRegistry[${JSON.stringify(k)}] = ${body};`)
    .join("\n");
  return { code: { type: "plain", content }, sdkVersion: "1.0.0", featureFlags: undefined };
}

function lambda(handle: string): ConfigRenderLambda {
  return { __renderLambda: true, handle };
}

describe("WarmModelVms", () => {
  let quickJs: QuickJSWASMModule;

  beforeAll(async () => {
    quickJs = await getQuickJS();
  });

  function runtimes(fn: () => void): number {
    const spy = vi.spyOn(quickJs, "newRuntime");
    try {
      fn();
      return spy.mock.calls.length;
    } finally {
      spy.mockRestore();
    }
  }

  test("evaluates a bundle once for many calls", () => {
    const vms = new WarmModelVms(quickJs);
    const c = code({ double: "(x) => x * 2" });
    const results: unknown[] = [];
    const n = runtimes(() => {
      for (let i = 0; i < 5; i++) results.push(vms.run(lambda("double"), c, i));
    });
    expect(n).toBe(1);
    expect(results).toEqual([0, 2, 4, 6, 8]);
    vms.dispose();
  });

  test("drops the VM after a failed call", () => {
    const vms = new WarmModelVms(quickJs);
    const c = code({ fail: "(x) => { if (x) throw new Error('boom'); return 1; }" });
    vms.run(lambda("fail"), c, false);
    expect(() => vms.run(lambda("fail"), c, true)).toThrow();
    expect(runtimes(() => vms.run(lambda("fail"), c, false))).toBe(1);
    vms.dispose();
  });

  test("keeps the VM when the callback is missing", () => {
    const vms = new WarmModelVms(quickJs);
    const c = code({ one: "() => 1" });
    vms.run(lambda("one"), c);
    expect(() => vms.run(lambda("absent"), c)).toThrow("No such callback: absent");
    expect(runtimes(() => vms.run(lambda("one"), c))).toBe(0);
    vms.dispose();
  });

  test("releases result handles after each call", () => {
    const vms = new WarmModelVms(quickJs);
    const c = code({ big: "(i) => ({ i, s: 'x'.repeat(10000) })" });
    for (let i = 0; i < 2000; i++) expect(vms.run(lambda("big"), c, i)).toMatchObject({ i });
    vms.dispose();
  });

  test("evicts the least recently used bundle", () => {
    const vms = new WarmModelVms(quickJs, 1);
    const a = code({ a: "() => 'a'" });
    const b = code({ b: "() => 'b'" });
    vms.run(lambda("a"), a);
    vms.run(lambda("b"), b);
    expect(runtimes(() => vms.run(lambda("a"), a))).toBe(1);
    vms.dispose();
  });

  test("keeps module state of block code between successful calls", () => {
    const vms = new WarmModelVms(quickJs);
    const c = code({ count: "(() => { let n = 0; return () => ++n; })()" });
    expect([vms.run(lambda("count"), c), vms.run(lambda("count"), c)]).toEqual([1, 2]);
    vms.dispose();
  });

  test("drops the VM when the result cannot be imported", () => {
    const vms = new WarmModelVms(quickJs);
    const c = code({ big: "(b) => (b ? 1n : 1)" });
    vms.run(lambda("big"), c, false);
    expect(() => vms.run(lambda("big"), c, true)).toThrow();
    expect(runtimes(() => vms.run(lambda("big"), c, false))).toBe(1);
    vms.dispose();
  });

  test("does not keep a bundle that fails to evaluate", () => {
    const vms = new WarmModelVms(quickJs);
    const bad: BlockCodeWithInfo = {
      code: { type: "plain", content: "throw new Error('bad bundle');" },
      sdkVersion: "1.0.0",
      featureFlags: undefined,
    };
    expect(() => vms.run(lambda("any"), bad)).toThrow();
    expect(
      runtimes(() => {
        expect(() => vms.run(lambda("any"), bad)).toThrow();
      }),
    ).toBe(1);
    vms.dispose();
  });

  test("refuses calls after dispose", () => {
    const vms = new WarmModelVms(quickJs);
    const c = code({ one: "() => 1" });
    vms.run(lambda("one"), c);
    vms.dispose();
    expect(runtimes(() => expect(() => vms.run(lambda("one"), c)).toThrow("disposed"))).toBe(0);
  });
});
