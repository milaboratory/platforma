import { describe, expect, it } from "vitest";
import { createPlRef, isPlRef, isPrimaryRef } from "./ref";

const sampleRef = createPlRef("block1", "output1", true);

describe("isPrimaryRef", () => {
  it("returns true for a valid PrimaryRef", () => {
    expect(isPrimaryRef({ __isPrimaryRef: "v1", column: sampleRef })).toBe(true);
  });

  it("returns true for PrimaryRef with filter", () => {
    const filter = createPlRef("block1", "filter1");
    expect(isPrimaryRef({ __isPrimaryRef: "v1", column: sampleRef, filter })).toBe(true);
  });

  it("returns false for a PlRef", () => {
    expect(isPrimaryRef(sampleRef)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPrimaryRef(null)).toBe(false);
  });

  it("returns false for a plain object", () => {
    expect(isPrimaryRef({ foo: "bar" })).toBe(false);
  });
});

describe("isPlRef", () => {
  it("returns false for a PrimaryRef", () => {
    expect(isPlRef({ __isPrimaryRef: "v1", column: sampleRef })).toBe(false);
  });

  it("returns true for a PlRef", () => {
    expect(isPlRef(sampleRef)).toBe(true);
  });
});
