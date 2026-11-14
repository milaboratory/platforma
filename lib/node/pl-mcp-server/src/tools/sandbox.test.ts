import { describe, expect, it, vi } from "vitest";
import { getQuickJS } from "quickjs-emscripten";
import { safeEval } from "./sandbox";

const FOREVER = "(() => { while (true) {} })()";

describe("safeEval", () => {
  it("interrupts a non-terminating expression at its deadline", async () => {
    const started = Date.now();
    await expect(safeEval(FOREVER, {}, 200)).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("interrupts both of two overlapping evaluations", async () => {
    const results = await Promise.allSettled([
      safeEval(FOREVER, {}, 200),
      safeEval(FOREVER, {}, 200),
    ]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
  });

  it("leaves no runtime created but undisposed when two evaluations start together", async () => {
    const quickjs = await getQuickJS();
    let created = 0;
    let disposed = 0;
    const newRuntime = quickjs.newRuntime.bind(quickjs);
    const spy = vi.spyOn(quickjs, "newRuntime").mockImplementation((options) => {
      created++;
      const runtime = newRuntime(options);
      const dispose = runtime.dispose.bind(runtime);
      runtime.dispose = () => {
        disposed++;
        dispose();
      };
      return runtime;
    });

    try {
      await Promise.allSettled([safeEval("1 + 1", {}, 1000), safeEval("2 + 2", {}, 1000)]);
    } finally {
      spy.mockRestore();
    }

    expect(created).toBe(2);
    expect(disposed).toBe(created);
  });

  it("rejects an expression that allocates past the memory limit, then serves the next one", async () => {
    await expect(
      safeEval(
        "(() => { const a = []; while (true) a.push(new Array(1e6).fill(0)); })()",
        {},
        5000,
      ),
    ).rejects.toThrow();
    await expect(safeEval("1 + 1", {}, 1000)).resolves.toBe(2);
  });

  it("rejects unbounded recursion instead of ending the process", async () => {
    await expect(
      safeEval("(() => { const f = () => f(); return f(); })()", {}, 5000),
    ).rejects.toThrow();
  });

  it("exposes no Node global to a transform", async () => {
    await expect(safeEval("typeof process", {}, 1000)).resolves.toBe("undefined");
    await expect(safeEval("typeof require", {}, 1000)).resolves.toBe("undefined");
  });

  it("reads injected context variables by name", async () => {
    await expect(safeEval("rows.length", { rows: [{ a: 1 }, { a: 2 }] }, 1000)).resolves.toBe(2);
  });
});
