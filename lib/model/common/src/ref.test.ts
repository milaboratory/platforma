import { describe, expect, it } from "vitest";
import type { PObjectId } from "./pool/spec";
import { createEnrichmentRef, createPlRef, isEnrichmentRef, isPlRef, isPrimaryRef } from "./ref";

const sampleRef = createPlRef("block1", "output1", true);
const sampleHit = "hit-1" as PObjectId;
const sampleLinker = "linker-1" as PObjectId;

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

  it("returns false for an EnrichmentRef", () => {
    expect(isPlRef({ __isEnrichment: "v1", hit: sampleHit, path: [] })).toBe(false);
  });

  it("returns true for a PlRef", () => {
    expect(isPlRef(sampleRef)).toBe(true);
  });
});

describe("isEnrichmentRef", () => {
  it("returns true for an EnrichmentRef with empty path", () => {
    expect(isEnrichmentRef({ __isEnrichment: "v1", hit: sampleHit, path: [] })).toBe(true);
  });

  it("returns true for an EnrichmentRef with linker steps", () => {
    expect(
      isEnrichmentRef({
        __isEnrichment: "v1",
        hit: sampleHit,
        path: [{ type: "linker", linker: sampleLinker }],
      }),
    ).toBe(true);
  });

  it("returns false for a PrimaryRef", () => {
    expect(isEnrichmentRef({ __isPrimaryRef: "v1", column: sampleRef })).toBe(false);
  });

  it("returns false for a PlRef", () => {
    expect(isEnrichmentRef(sampleRef)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isEnrichmentRef(null)).toBe(false);
  });
});

describe("createEnrichmentRef", () => {
  const sampleQual = { axis: { name: "a" }, contextDomain: { d: "1" } };

  it("creates an EnrichmentRef with a non-empty linker path", () => {
    const ref = createEnrichmentRef(sampleHit, {
      path: [{ type: "linker", linker: sampleLinker }],
    });
    expect(ref).toEqual({
      __isEnrichment: "v1",
      hit: sampleHit,
      path: [{ type: "linker", linker: sampleLinker }],
    });
    expect("qualifications" in ref).toBe(false);
  });

  it("omits path when none given", () => {
    const ref = createEnrichmentRef(sampleHit);
    expect(ref).toEqual({ __isEnrichment: "v1", hit: sampleHit });
    expect("path" in ref).toBe(false);
  });

  it("omits empty path", () => {
    const ref = createEnrichmentRef(sampleHit, { path: [] });
    expect("path" in ref).toBe(false);
  });

  it("attaches non-empty qualifications", () => {
    const ref = createEnrichmentRef(sampleHit, { qualifications: [sampleQual] });
    expect(ref.qualifications).toEqual([sampleQual]);
  });

  it("omits empty qualifications array", () => {
    const ref = createEnrichmentRef(sampleHit, { qualifications: [] });
    expect("qualifications" in ref).toBe(false);
  });
});
