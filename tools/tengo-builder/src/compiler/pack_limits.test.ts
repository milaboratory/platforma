import type { CompiledTemplateV3 } from "@milaboratories/pl-model-backend";
import { describe, expect, it } from "vitest";

import type { FullArtifactName } from "./package";
import {
  MAX_TEMPLATE_PACK_BYTES_GZIPPED,
  MAX_WASM_FILE_BYTES,
  assertTemplatePackSize,
  assertWasmFileSize,
  collectWasmContributions,
} from "./pack_limits";

const wasmName: FullArtifactName = {
  type: "wasm",
  pkg: "@test/pkg",
  id: "main",
  version: "1.0.0",
};

describe("assertWasmFileSize", () => {
  it("passes at exactly the cap", () => {
    expect(() => assertWasmFileSize("/p/a.wasm", MAX_WASM_FILE_BYTES, wasmName)).not.toThrow();
  });

  it("throws above the cap with file path, full name, and shrink hint", () => {
    let err: unknown;
    try {
      assertWasmFileSize("/p/a.wasm", MAX_WASM_FILE_BYTES + 1, wasmName);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toContain("/p/a.wasm");
    expect(msg).toContain("@test/pkg:main");
    expect(msg).toContain("wasm-opt -Oz");
    // points the reader at the backend source-of-truth
    expect(msg).toContain("assertions.go");
  });
});

describe("assertTemplatePackSize", () => {
  it("passes at exactly the cap", () => {
    expect(() =>
      assertTemplatePackSize("@t/pkg:main 1.0.0", MAX_TEMPLATE_PACK_BYTES_GZIPPED, []),
    ).not.toThrow();
  });

  it("lists WASM contributions sorted by size (largest first)", () => {
    let err: unknown;
    try {
      assertTemplatePackSize("@t/pkg:main 1.0.0", MAX_TEMPLATE_PACK_BYTES_GZIPPED + 1, [
        { name: "@small/wasm:main", rawBytes: 100 * 1024 },
        { name: "@big/wasm:main", rawBytes: 1.5 * 1024 * 1024 },
        { name: "@mid/wasm:main", rawBytes: 800 * 1024 },
      ]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    const big = msg.indexOf("@big/wasm:main");
    const mid = msg.indexOf("@mid/wasm:main");
    const small = msg.indexOf("@small/wasm:main");
    // all three present
    expect(big).toBeGreaterThan(-1);
    expect(mid).toBeGreaterThan(-1);
    expect(small).toBeGreaterThan(-1);
    // ordered big > mid > small
    expect(big).toBeLessThan(mid);
    expect(mid).toBeLessThan(small);
    expect(msg).toContain("@t/pkg:main 1.0.0");
    expect(msg).toContain("config.go");
  });

  it("includes a fallback hint when no WASM artefacts contributed", () => {
    let err: unknown;
    try {
      assertTemplatePackSize("@t/pkg:main 1.0.0", MAX_TEMPLATE_PACK_BYTES_GZIPPED + 1, []);
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toContain("no WASM artefacts");
  });
});

describe("collectWasmContributions", () => {
  // base64 length L → ~L * 3 / 4 raw bytes. Build a base64 string of the
  // requested length so the test is independent of any specific WASM payload.
  function base64OfLength(len: number): string {
    return "A".repeat(len);
  }

  it("reports direct WASM dependencies with raw byte size derived from base64 length", () => {
    const base64 = base64OfLength(400); // 400 base64 chars → 300 raw bytes
    const tpl: CompiledTemplateV3 = {
      type: "pl.tengo-template.v3",
      hashToSource: { "hash-a": base64 },
      template: {
        name: "@t/pkg:main",
        version: "1.0.0",
        sourceHash: "tpl-hash",
        libs: {},
        templates: {},
        software: {},
        assets: {},
        wasm: {
          "@w/wasm:a": { name: "@w/wasm:a", version: "1.0.0", sourceHash: "hash-a" },
        },
      },
    };
    const got = collectWasmContributions(tpl);
    expect(got).toEqual([{ name: "@w/wasm:a", rawBytes: 300 }]);
  });

  it("recurses into sub-templates and deduplicates by artefact name", () => {
    const base64a = base64OfLength(800); // 600 raw
    const base64b = base64OfLength(400); // 300 raw
    const tpl: CompiledTemplateV3 = {
      type: "pl.tengo-template.v3",
      hashToSource: { "hash-a": base64a, "hash-b": base64b },
      template: {
        name: "@t/pkg:root",
        version: "1.0.0",
        sourceHash: "root-hash",
        libs: {},
        software: {},
        assets: {},
        wasm: {
          "@w/wasm:a": { name: "@w/wasm:a", version: "1.0.0", sourceHash: "hash-a" },
        },
        templates: {
          "@t/pkg:child": {
            name: "@t/pkg:child",
            version: "1.0.0",
            sourceHash: "child-hash",
            libs: {},
            templates: {},
            software: {},
            assets: {},
            wasm: {
              // duplicate of the parent's WASM — must not be counted twice
              "@w/wasm:a": { name: "@w/wasm:a", version: "1.0.0", sourceHash: "hash-a" },
              "@w/wasm:b": { name: "@w/wasm:b", version: "1.0.0", sourceHash: "hash-b" },
            },
          },
        },
      },
    };
    const got = collectWasmContributions(tpl).sort((a, b) => a.name.localeCompare(b.name));
    expect(got).toEqual([
      { name: "@w/wasm:a", rawBytes: 600 },
      { name: "@w/wasm:b", rawBytes: 300 },
    ]);
  });

  it("returns an empty list when the template tree contains no WASM", () => {
    const tpl: CompiledTemplateV3 = {
      type: "pl.tengo-template.v3",
      hashToSource: {},
      template: {
        name: "@t/pkg:main",
        version: "1.0.0",
        sourceHash: "tpl-hash",
        libs: {},
        templates: {},
        software: {},
        assets: {},
      },
    };
    expect(collectWasmContributions(tpl)).toEqual([]);
  });
});
