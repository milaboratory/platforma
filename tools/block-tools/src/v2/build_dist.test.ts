import { randomUUID } from "crypto";
import { describe, expect, test } from "vitest";
import { loadPackDescription } from "./source_package";
import path from "path";
import { buildBlockPackDist, templateHasWasm } from "./build_dist";

test.skip("create dist test", async () => {
  const description = await loadPackDescription(
    "/Volumes/Data/Projects/MiLaboratory/blocks-beta/block-template",
  );
  console.dir(description, { depth: 5 });
  const uuid = randomUUID();
  const distPath = path.resolve("tmp", uuid);
  const manifest = await buildBlockPackDist(description, distPath);
  console.dir(manifest, { depth: 5 });
});

describe("templateHasWasm", () => {
  test("flat template with non-empty wasm map → true", () => {
    const tpl = {
      name: "@pkg:t",
      version: "1",
      sourceHash: "h",
      libs: {},
      templates: {},
      software: {},
      assets: {},
      wasm: { foo: { name: "@pkg/foo:main", version: "1", sourceHash: "x" } },
    };
    expect(templateHasWasm(tpl)).toBe(true);
  });

  test("flat template with no wasm field → false", () => {
    const tpl = {
      name: "@pkg:t",
      version: "1",
      sourceHash: "h",
      libs: {},
      templates: {},
      software: {},
      assets: {},
    };
    expect(templateHasWasm(tpl)).toBe(false);
  });

  test("flat template with empty wasm map → false", () => {
    const tpl = {
      name: "@pkg:t",
      version: "1",
      sourceHash: "h",
      libs: {},
      templates: {},
      software: {},
      assets: {},
      wasm: {},
    };
    expect(templateHasWasm(tpl)).toBe(false);
  });

  test("nested template carrying wasm in a sub-template → true (recursive)", () => {
    const tpl = {
      name: "@pkg:root",
      version: "1",
      sourceHash: "h",
      libs: {},
      software: {},
      assets: {},
      templates: {
        "@pkg:child": {
          name: "@pkg:child",
          version: "1",
          sourceHash: "h2",
          libs: {},
          templates: {},
          software: {},
          assets: {},
          wasm: { p: { name: "@pkg/p:main", version: "1", sourceHash: "x" } },
        },
      },
    };
    expect(templateHasWasm(tpl)).toBe(true);
  });

  test("non-object input → false (defensive)", () => {
    expect(templateHasWasm(null)).toBe(false);
    expect(templateHasWasm(undefined)).toBe(false);
    expect(templateHasWasm("string")).toBe(false);
    expect(templateHasWasm(42)).toBe(false);
  });
});
