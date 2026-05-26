import { BackendCapability } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

// Guest memory cap enforcement. Each probe runs in its own sibling
// instance (so a trap on one doesn't poison the next), and consumes a
// targeted amount of heap. The backend's FallbackWasmMemoryBytes is 32 MiB
// — clamped between MinWasmMemoryBytes (16 MiB) and MaxWasmMemoryBytes
// (64 MiB) — so requests around the boundary should split into success
// vs trap.
tplTest.concurrent(
  "assets.importWasm — guest memory cap traps allocations over the limit",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability(BackendCapability.WasmV1)) {
      skip();
      return;
    }

    const result = await helper.renderTemplate(
      false,
      "wasm.memory-cap",
      ["small", "medium", "overLimit", "wayOver"],
      () => ({}),
    );

    const [small, medium, overLimit, wayOver] = await Promise.all([
      result.computeOutput("small", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("medium", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("overLimit", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("wayOver", (a) => a?.getDataAsJson()).awaitStableValue(),
    ]);

    // Under-limit: ack string includes a checksum prefix from the guest.
    expect(small as string).toMatch(/consumed/);
    expect(medium as string).toMatch(/consumed/);

    // Over-limit: trap surfaces as a wasm error string from the bridge.
    // Common substrings include "trap", "unreachable", "out of bounds",
    // "memory", "wasm:" — any of those is acceptable. The crucial check
    // is that the call did NOT return a "consumed" ack.
    expect(overLimit as string).not.toMatch(/consumed/);
    expect(overLimit as string).toMatch(/trap|unreachable|out of bounds|memory|wasm|alloc|error/i);
    expect(wayOver as string).not.toMatch(/consumed/);
    expect(wayOver as string).toMatch(/trap|unreachable|out of bounds|memory|wasm|alloc|error/i);
  },
);
