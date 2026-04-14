import { describe, expect, it } from "vitest";
import { inferAllReferencedBlocks, outputRef } from "./args";

describe("inferAllReferencedBlocks", () => {
  it("finds __isRef inside nested PrimaryRef column and filter fields", () => {
    const primaryRef = {
      __isPrimaryRef: "v1",
      column: outputRef("block1", "col1", true),
      filter: outputRef("block2", "flt1"),
    };

    const result = inferAllReferencedBlocks({ dataset: primaryRef });

    expect(result.upstreams).toContain("block1");
    expect(result.upstreams).toContain("block2");
    expect(result.upstreams.size).toBe(2);
    expect(result.upstreamsRequiringEnrichments).toContain("block1");
    expect(result.missingReferences).toBe(false);
  });

  it("finds __isRef in PrimaryRef without filter", () => {
    const primaryRef = {
      __isPrimaryRef: "v1",
      column: outputRef("block1", "col1"),
    };

    const result = inferAllReferencedBlocks(primaryRef);

    expect(result.upstreams).toContain("block1");
    expect(result.upstreams.size).toBe(1);
  });
});
