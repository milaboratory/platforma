import { tplTest } from "@platforma-sdk/test";

// Guest memory cap contract the backend exposes to block authors:
//   - default cap when the block doesn't override it:  32 MiB
//   - lower clamp on an explicit block-level override: 16 MiB
//   - upper clamp on an explicit block-level override: 64 MiB
//
// These templates don't override DefaultMemoryLimit, so the live cap is
// the default (32 MiB). Allocations ≤ 32 MiB succeed; > 32 MiB trap and
// abort the script. If the backend changes any of these numbers, these
// tests break and we revisit probe sizes (and the comment) instead of
// silently drifting.

tplTest.concurrent(
  "assets.importWasm — sub-cap allocations succeed",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(
      false,
      "wasm.memory-cap",
      ["wellBelow", "nearBelow"],
      () => ({}),
    );
    const [wellBelow, nearBelow] = await Promise.all([
      result.computeOutput("wellBelow", (a) => a?.getDataAsJson()).awaitStableValue(),
      result.computeOutput("nearBelow", (a) => a?.getDataAsJson()).awaitStableValue(),
    ]);
    expect(wellBelow as string).toMatch(/consumed/);
    expect(nearBelow as string).toMatch(/consumed/);
  },
);

// Over-cap probes: each one's allocation traps inside the guest and the
// render aborts. We test two distances above the cap (near = +8 MiB;
// far = 2× cap, also at the upper-clamp ceiling) to make sure the trap
// fires across the whole over-cap range, not just on a specific size.
// The output computable rejects with a wasm trap message.
tplTest.concurrent(
  "assets.importWasm — alloc just above the live cap traps and aborts",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(
      false,
      "wasm.memory-cap-overflow-near",
      ["unreachable"],
      () => ({}),
    );
    await expect(
      result.computeOutput("unreachable", (a) => a?.getDataAsJson()).awaitStableValue(),
    ).rejects.toThrow(/wasm trap|memory|allocation|consume-memory/);
  },
);

tplTest.concurrent(
  "assets.importWasm — alloc well above the live cap traps and aborts",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability("wasm:v1")) {
      skip();
      return;
    }
    const result = await helper.renderTemplate(
      false,
      "wasm.memory-cap-overflow-far",
      ["unreachable"],
      () => ({}),
    );
    await expect(
      result.computeOutput("unreachable", (a) => a?.getDataAsJson()).awaitStableValue(),
    ).rejects.toThrow(/wasm trap|memory|allocation|consume-memory/);
  },
);
