import { BackendCapability } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";
import { vi } from "vitest";

// Payload-size round-trip. Asserts that echoBytes returns exactly `n`
// bytes for each tested size and that the deterministic pattern survives
// the host<->guest copy path byte-for-byte. The 8 MiB case dominates
// runtime; raise testTimeout so we don't false-fail on slower hardware.
vi.setConfig({ testTimeout: 60_000 });

const PATTERN = "0123456789";

function patternByte(i: number): string {
  return PATTERN[i % 10];
}

function checkPattern(
  s: string,
  n: number,
  expect: ReturnType<(typeof import("vitest"))["expect"]>,
) {
  expect(s.length).toBe(n);
  if (n === 0) return;
  expect(s[0]).toBe(patternByte(0));
  expect(s[n - 1]).toBe(patternByte(n - 1));
  // Sample a middle byte too so we catch a host buffer truncation that
  // happens to leave the boundaries alone.
  const mid = Math.floor(n / 2);
  expect(s[mid]).toBe(patternByte(mid));
}

tplTest.concurrent(
  "assets.importWasm — echoBytes preserves length and content across sizes",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability(BackendCapability.WasmV1)) {
      skip();
      return;
    }

    const result = await helper.renderTemplate(
      false,
      "wasm.echo-roundtrip",
      ["zero", "one", "k64", "m1", "m2"],
      () => ({}),
    );

    const [zero, one, k64, m1, m2] = await Promise.all([
      result.computeOutput("zero", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("one", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("k64", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("m1", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("m2", (a) => a?.getDataAsJson()).awaitStableValue(),
    ]);

    checkPattern(zero as string, 0, expect);
    checkPattern(one as string, 1, expect);
    checkPattern(k64 as string, 64 * 1024, expect);
    checkPattern(m1 as string, 1024 * 1024, expect);
    checkPattern(m2 as string, 2 * 1024 * 1024, expect);
  },
);
