import { BackendCapability } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

// Guest memory cap enforcement. Each probe runs in its own sibling
// instance (so a trap on one doesn't poison the next) and consumes a
// targeted amount of heap.
//
// Per-instance memory contract the backend exposes to block authors:
//   - default cap when the block doesn't override it:  32 MiB
//   - lower clamp on an explicit block-level override: 16 MiB
//   - upper clamp on an explicit block-level override: 64 MiB
//
// This template doesn't override DefaultMemoryLimit, so the live cap is
// the default (32 MiB). Allocations ≤ 32 MiB must succeed; > 32 MiB must
// trap. If the backend changes any of the three numbers above, this
// test breaks and we revisit the probe sizes (and the comment) instead
// of silently drifting.
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
      ["wellBelow", "nearBelow", "nearAbove", "wellAbove"],
      () => ({}),
    );

    const [wellBelow, nearBelow, nearAbove, wellAbove] = await Promise.all([
      result.computeOutput("wellBelow", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("nearBelow", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("nearAbove", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("wellAbove", (a) => a?.getDataAsJson()).awaitStableValue(),
    ]);

    // Below the live cap: the fixture's consumeMemory returns an ack
    // string with a "consumed" prefix once the allocation lands.
    expect(wellBelow as string).toMatch(/consumed/);
    expect(nearBelow as string).toMatch(/consumed/);

    // Above the live cap: trap surfaces as a wasm error string from the
    // bridge. Common substrings include "trap", "unreachable", "out of
    // bounds", "memory", "wasm:" — any of those is acceptable. The
    // crucial check is that the call did NOT return a "consumed" ack.
    expect(nearAbove as string).not.toMatch(/consumed/);
    expect(nearAbove as string).toMatch(/trap|unreachable|out of bounds|memory|wasm|alloc|error/i);
    expect(wellAbove as string).not.toMatch(/consumed/);
    expect(wellAbove as string).toMatch(/trap|unreachable|out of bounds|memory|wasm|alloc|error/i);
  },
);
