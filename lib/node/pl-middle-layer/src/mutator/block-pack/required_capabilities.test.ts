import { gzipSync, zstdCompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { CompiledTemplateV3, CompiledTemplateV4 } from "@milaboratories/pl-model-backend";
import {
  deriveRequiredCapabilities,
  requiredCapabilitiesFromTemplate,
} from "./required_capabilities";

const v4: CompiledTemplateV4 = {
  type: "pl.tengo-template.v4",
  hashToSource: {},
  hashToTemplate: {
    root: {
      name: "@t/pkg:main",
      version: "1.0.0",
      sourceHash: "src",
      libs: {},
      templates: {},
      software: {},
      assets: {},
      requiredCapabilities: ["wasm:v1"],
    },
  },
  template: "root",
};

const v3: CompiledTemplateV3 = {
  type: "pl.tengo-template.v3",
  hashToSource: {},
  template: {
    name: "@t/pkg:main",
    version: "1.0.0",
    sourceHash: "src",
    libs: {},
    templates: {},
    software: {},
    assets: {},
    requiredCapabilities: ["wasm:v1"],
  },
};

describe("requiredCapabilitiesFromTemplate", () => {
  it("reads the root node of a v4 pack", () => {
    expect(requiredCapabilitiesFromTemplate(v4)).toEqual(["wasm:v1"]);
  });

  // Regression guard: every block published before v4 carries its
  // requirements in a v3 pack. Reading only v4 would report "no
  // requirements" and let a WASM block install on a backend without the
  // runtime.
  it("still reads a v3 pack", () => {
    expect(requiredCapabilitiesFromTemplate(v3)).toEqual(["wasm:v1"]);
  });

  it("returns undefined when a v4 pack declares nothing", () => {
    const bare: CompiledTemplateV4 = {
      ...v4,
      hashToTemplate: { root: { ...v4.hashToTemplate.root, requiredCapabilities: undefined } },
    };
    expect(requiredCapabilitiesFromTemplate(bare)).toBeUndefined();
  });

  it("returns undefined for a v2 pack", () => {
    const v2 = { type: "pl.tengo-template.v2", name: "@t/pkg:main", version: "1.0.0" };
    expect(requiredCapabilitiesFromTemplate(v2 as never)).toBeUndefined();
  });
});

describe("deriveRequiredCapabilities", () => {
  const zstd = (value: unknown) => zstdCompressSync(Buffer.from(JSON.stringify(value)));

  it("reads a zstd v4 pack", () => {
    expect(deriveRequiredCapabilities(zstd(v4), "zstd")).toEqual(["wasm:v1"]);
  });

  // Published blocks are gzip and stay readable under their original name.
  it("reads a gzip v3 pack", () => {
    expect(deriveRequiredCapabilities(gzipSync(JSON.stringify(v3)), "gzip")).toEqual(["wasm:v1"]);
  });

  it("returns undefined for bytes that are not a pack", () => {
    expect(deriveRequiredCapabilities(Buffer.from("not a pack"), "gzip")).toBeUndefined();
  });
});
