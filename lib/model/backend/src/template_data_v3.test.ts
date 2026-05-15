import { describe, expect, test } from "vitest";
import type { TemplateDataV3 } from "./template_data_v3";
import { templateHasWasm } from "./template_data_v3";

describe("templateHasWasm", () => {
  test("flat template with non-empty wasm map → true", () => {
    const tpl: TemplateDataV3 = {
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
    const tpl: TemplateDataV3 = {
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
    const tpl: TemplateDataV3 = {
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
    const tpl: TemplateDataV3 = {
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
});
