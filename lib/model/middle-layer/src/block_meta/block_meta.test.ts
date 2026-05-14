import { describe, expect, test } from "vitest";
import { BlockPackMetaDescriptionRaw } from "./block_meta";

const minimal = {
  title: "T",
  description: "D",
  organization: { name: "Org", url: "https://example.com/" },
};

describe("BlockPackMeta requiredCapabilities", () => {
  test("accepts and round-trips the field", () => {
    const parsed = BlockPackMetaDescriptionRaw.parse({
      ...minimal,
      requiredCapabilities: ["wasm"],
    });
    expect(parsed.requiredCapabilities).toEqual(["wasm"]);
  });

  test("accepts arbitrary token strings (loose, not enum)", () => {
    const parsed = BlockPackMetaDescriptionRaw.parse({
      ...minimal,
      requiredCapabilities: ["wasm", "future-feature"],
    });
    expect(parsed.requiredCapabilities).toEqual(["wasm", "future-feature"]);
  });

  test("absent field stays optional (legacy manifests)", () => {
    const parsed = BlockPackMetaDescriptionRaw.parse(minimal);
    expect(parsed.requiredCapabilities).toBeUndefined();
  });

  test("forward-compat: unknown sibling fields pass through (not stripped)", () => {
    // Schema uses `.passthrough()` so older block-tools versions don't drop
    // fields they don't know about during registry-mutating round-trips
    // (mark-stable, refresh-registry, restore-overview-from-snapshot).
    const parsed = BlockPackMetaDescriptionRaw.parse({
      ...minimal,
      requiredCapabilities: ["wasm"],
      futureFieldNoOldDesktopKnowsAbout: { x: 1 },
    });
    expect(parsed).toHaveProperty("futureFieldNoOldDesktopKnowsAbout", { x: 1 });
    expect(parsed.requiredCapabilities).toEqual(["wasm"]);
  });
});
