import { describe, expect, test, vi } from "vitest";
import { ResourceTypeName, ResourceTypePrefix } from "@milaboratories/pl-model-common";
import {
  CacheFinality,
  DefaultFinalResourceDataPredicate,
  StrictFinality,
  TreeFinality,
} from "./final";
import { FinalityTable } from "./finality";
import type { FinalResourceDataPredicate } from "./finality";
import type { FieldData, ResourceData } from "./types";
import { createSignedResourceId, NullSignedResourceId } from "./types";

function resource(typeName: string, resourceReady = true): ResourceData {
  return {
    id: createSignedResourceId(1n),
    originalResourceId: NullSignedResourceId,
    kind: "Structural",
    type: { name: typeName, version: "1" },
    data: undefined,
    error: NullSignedResourceId,
    inputsLocked: resourceReady,
    outputsLocked: resourceReady,
    resourceReady,
    final: false,
    fields: [],
  };
}

const base = FinalityTable.of("base", [
  { match: { name: "A" }, rule: "readyOrDuplicateOrError", why: "test" },
  { match: { name: "B" }, rule: "never", why: "test" },
]);

test("a child layer is its parent plus its additions", () => {
  const child = base.extend("child", [
    { match: { name: "B" }, rule: "always", why: "test" },
    { match: { prefix: "C/" }, rule: "always", why: "test" },
  ]);
  expect(child.isFinal(resource("A"))).toBe(true);
  expect(child.isFinal(resource("A", false))).toBe(false);
  expect(child.isFinal(resource("B"))).toBe(true);
  expect(child.isFinal(resource("C/x"))).toBe(true);
  expect(base.isFinal(resource("B"))).toBe(false);
  expect(base.isFinal(resource("C/x"))).toBe(false);
});

test("an addition cannot make its parent's final resource non-final", () => {
  const child = base.extend("child", [{ match: { name: "A" }, rule: "never", why: "test" }]);
  expect(child.isFinal(resource("A"))).toBe(true);
});

test("a type no layer covers is never final", () => {
  expect(base.extend("child", []).isFinal(resource("Unknown"))).toBe(false);
});

test("a layer lists each match once", () => {
  expect(() =>
    FinalityTable.of("dup", [
      { match: { name: "A" }, rule: "always", why: "test" },
      { match: { name: "A" }, rule: "never", why: "test" },
    ]),
  ).toThrow(/listed twice/);
});

test("entries list the base first", () => {
  const child = base.extend("child", [{ match: { prefix: "C/" }, rule: "always", why: "test" }]);
  expect(child.entries.map((e) => ("name" in e.match ? e.match.name : e.match.prefix))).toEqual([
    "A",
    "B",
    "C/",
  ]);
});

describe("the built-in tables", () => {
  type Snapshot = Parameters<FinalResourceDataPredicate>[0];
  const id = createSignedResourceId(101n);
  const target = createSignedResourceId(102n);
  const error = createSignedResourceId(103n);

  function field(patch: Partial<FieldData> = {}): FieldData {
    return {
      name: "out",
      type: "Output",
      status: "Resolved",
      value: target,
      error: NullSignedResourceId,
      valueIsFinal: true,
      ...patch,
    };
  }

  function resource(name: string, patch: Partial<Snapshot> = {}): Snapshot {
    return {
      id,
      type: { name, version: "1" },
      kind: "Structural",
      data: undefined,
      originalResourceId: NullSignedResourceId,
      error: NullSignedResourceId,
      inputsLocked: true,
      outputsLocked: true,
      resourceReady: true,
      final: false,
      fields: [field()],
      ...patch,
    };
  }

  // The expected answers, listed independently of the table's entries.
  const alwaysFinal = new Set([
    "Blob",
    "WorkingDirectory",
    "json/object",
    "json-gz/object",
    "json/string",
    "json/array",
    "json/number",
    "json/bool",
    "json/null",
    "json/errorTrace",
    "BContextEnd",
    "Frontend/FromUrl",
    "Frontend/FromFolder",
    "Frontend/FromLocalTgz",
    "BObjectSpec",
    "Null",
    "binary",
  ]);
  const finalWhenTerminal = new Set([
    "Dummy",
    "StdMap",
    "std/map",
    "EphStdMap",
    "PFrame",
    "ParquetChunk",
    "BContext",
    "BlockPackCustom",
    "BinaryMap",
    "BinaryValue",
    "BlobMap",
    "BResolveSingleNoResult",
    "BQueryResult",
    "TengoTemplate",
    "TengoLib",
    "SoftwareInfo",
  ]);
  const neverFinal = new Set([
    "UserProject",
    "Projects",
    "ClientRoot",
    "SharingOutbox",
    "SharingState",
    "SharedEnvelope",
    "BResolveSingle",
    "BResolveChoice",
    "LSProvider",
  ]);
  function terminal(r: Snapshot): boolean {
    return (
      r.resourceReady ||
      r.originalResourceId !== NullSignedResourceId ||
      r.error !== NullSignedResourceId
    );
  }
  function filled(r: Snapshot): boolean {
    return (
      terminal(r) &&
      r.outputsLocked &&
      (r.fields === undefined ||
        r.fields.every(
          (f) =>
            f.error !== NullSignedResourceId ||
            (f.value !== NullSignedResourceId && f.valueIsFinal),
        ))
    );
  }
  function expectedTree(r: Snapshot): boolean {
    const name = r.type.name;
    if (name === "BResolveSingle" || name === "BResolveChoice" || name.startsWith("BlobCopy/"))
      return filled(r);
    if (name === "StreamManager") {
      if (!terminal(r)) return false;
      if (r.fields === undefined || r.error !== NullSignedResourceId) return true;
      const stream = r.fields.find((f) => f.name === "stream");
      const downloadable = r.fields.find((f) => f.name === "downloadable");
      return (
        stream !== undefined &&
        downloadable !== undefined &&
        stream.value !== NullSignedResourceId &&
        stream.value === downloadable.value
      );
    }
    if (alwaysFinal.has(name)) return true;
    if (finalWhenTerminal.has(name)) return terminal(r);
    if (neverFinal.has(name)) return false;
    if (name === "json/resourceError") return r.type.version === "1";
    if (
      ["Blob/", "LS/", "WorkingDirectory/", "StorageSpaceAllocation/"].some((p) =>
        name.startsWith(p),
      )
    )
      return true;
    if (["BlobUpload/", "BlobIndex/"].some((p) => name.startsWith(p))) return filled(r);
    if (["PColumnData/", "StreamWorkdir/"].some((p) => name.startsWith(p))) return terminal(r);
    return false;
  }

  const names = [
    ...new Set([
      ...Object.values(ResourceTypeName),
      ...Object.values(ResourceTypePrefix).flatMap((p) => [
        p,
        p + "fs",
        p + "BlobUpload/fs",
        p.slice(0, -1),
        "x" + p,
        p.replace("/", "X/"),
      ]),
      "Blob/BlobCopy/fs",
      "BlobUpload",
      "BlobIndex",
      "BlobCopy",
      "BlobUploadX/fs",
      "LSProvider/x",
      "StdMap/child",
      "std/map/child",
      "json/resourceError/child",
    ]),
  ];
  const fieldStates: Array<Snapshot["fields"]> = [
    undefined,
    [],
    [field()],
    [field({ valueIsFinal: false })],
    [field({ value: NullSignedResourceId, valueIsFinal: false, status: "Empty" })],
    [field({ value: NullSignedResourceId, valueIsFinal: false, error })],
    [field(), field({ name: "service", type: "Service", valueIsFinal: false })],
    [field({ name: "stream" }), field({ name: "downloadable" })],
    [field({ name: "stream" }), field({ name: "downloadable", value: error })],
  ];

  test("every built-in name and prefix, at every version and state, gets the answer of the rules it is listed with", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const mismatches: string[] = [];
    try {
      for (const name of names)
        for (const version of ["", "1", "2", "01"]) {
          for (let bits = 0; bits < 16; bits++)
            for (const fields of fieldStates) {
              const r = resource(name, {
                type: { name, version },
                resourceReady: !!(bits & 1),
                outputsLocked: !!(bits & 2),
                originalResourceId: bits & 4 ? target : NullSignedResourceId,
                error: bits & 8 ? error : NullSignedResourceId,
                fields,
              });
              const tree = expectedTree(r);
              const cache = name !== "Blob" && name !== "StreamManager" && tree;
              if (
                TreeFinality.isFinal(r) !== tree ||
                DefaultFinalResourceDataPredicate(r) !== tree ||
                CacheFinality.isFinal(r) !== cache
              )
                mismatches.push(
                  JSON.stringify(r, (_, v) => (typeof v === "bigint" ? String(v) : v)),
                );
            }
        }
      expect(mismatches).toEqual([]);
    } finally {
      log.mockRestore();
    }
  });

  test("a built-in type is never logged as unknown; an unknown one is logged once, whatever its version or layer", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      for (const name of [
        ...Object.values(ResourceTypeName),
        ...Object.values(ResourceTypePrefix).map((p) => p + "probe"),
      ]) {
        for (const layer of [StrictFinality, CacheFinality, TreeFinality])
          layer.isFinal(resource(name));
      }
      expect(log).not.toHaveBeenCalled();
      const name = "unknown-log-probe/x";
      for (const version of ["1", "2", "1"])
        for (const layer of [StrictFinality, CacheFinality, TreeFinality]) {
          expect(layer.isFinal(resource(name, { type: { name, version } }))).toBe(false);
        }
      expect(log.mock.calls).toEqual([["UNKNOWN RESOURCE TYPE: " + name]]);
    } finally {
      log.mockRestore();
    }
  });
});
