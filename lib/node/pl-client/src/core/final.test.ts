import { expect, test } from "vitest";
import {
  CacheFinality,
  DefaultFinalResourceDataPredicate,
  StrictFinality,
  TreeFinality,
} from "./final";
import type { FieldData, ResourceData } from "./types";
import { createSignedResourceId, NullSignedResourceId } from "./types";

const A = createSignedResourceId(1n);
const B = createSignedResourceId(2n);

function streamManager(patch: Partial<ResourceData>): ResourceData {
  return {
    id: createSignedResourceId(10n),
    originalResourceId: NullSignedResourceId,
    kind: "Structural",
    type: { name: "StreamManager", version: "1" },
    data: undefined,
    error: NullSignedResourceId,
    inputsLocked: true,
    outputsLocked: true,
    resourceReady: true,
    final: false,
    fields: [],
    ...patch,
  };
}

function field(name: string, value: typeof A): FieldData {
  return {
    name,
    type: "Output",
    status: "Resolved",
    value,
    error: NullSignedResourceId,
    valueIsFinal: true,
  };
}

test("a ready, non-errored StreamManager with its fields pruned away is not final, and does not throw", () => {
  expect(DefaultFinalResourceDataPredicate(streamManager({ fields: [] }))).toBe(false);
  expect(DefaultFinalResourceDataPredicate(streamManager({ fields: [field("stream", A)] }))).toBe(
    false,
  );
});

test("a ready StreamManager is final once stream and downloadable share a non-null value", () => {
  expect(
    DefaultFinalResourceDataPredicate(
      streamManager({ fields: [field("stream", A), field("downloadable", B)] }),
    ),
  ).toBe(false);
  expect(
    DefaultFinalResourceDataPredicate(
      streamManager({ fields: [field("stream", B), field("downloadable", B)] }),
    ),
  ).toBe(true);
});

test("an errored StreamManager is final whatever its fields", () => {
  expect(DefaultFinalResourceDataPredicate(streamManager({ error: A, fields: [] }))).toBe(true);
});

test("a StreamManager with both fields still empty is not final", () => {
  const empty = (name: string): FieldData => ({
    ...field(name, A),
    value: NullSignedResourceId,
    status: "Empty",
    valueIsFinal: false,
  });
  expect(
    DefaultFinalResourceDataPredicate(
      streamManager({ fields: [empty("stream"), empty("downloadable")] }),
    ),
  ).toBe(false);
});

//
// The table, layer by layer.
//

function resource(typeName: string, patch: Partial<ResourceData> = {}): ResourceData {
  return streamManager({ type: { name: typeName, version: "1" }, ...patch });
}

const notReady: Partial<ResourceData> = {
  resourceReady: false,
  inputsLocked: false,
  outputsLocked: false,
};

const filledOutput = { fields: [field("out", A)] };
const unfilledOutput = {
  fields: [
    {
      ...field("out", A),
      value: NullSignedResourceId,
      status: "Empty" as const,
      valueIsFinal: false,
    },
  ],
};

test("a resolver is final once ready with every output filled", () => {
  for (const name of ["BResolveSingle", "BResolveChoice"]) {
    expect(DefaultFinalResourceDataPredicate(resource(name, filledOutput))).toBe(true);
    expect(DefaultFinalResourceDataPredicate(resource(name, unfilledOutput))).toBe(false);
    expect(
      DefaultFinalResourceDataPredicate(resource(name, { ...notReady, ...filledOutput })),
    ).toBe(false);
  }
});

test("a blob copy is final once ready with its incarnation filled", () => {
  expect(DefaultFinalResourceDataPredicate(resource("BlobCopy/aToB", filledOutput))).toBe(true);
  expect(DefaultFinalResourceDataPredicate(resource("BlobCopy/aToB", unfilledOutput))).toBe(false);
});

test("BResolveSingleNoResult is final at ready", () => {
  expect(DefaultFinalResourceDataPredicate(resource("BResolveSingleNoResult"))).toBe(true);
  expect(DefaultFinalResourceDataPredicate(resource("BResolveSingleNoResult", notReady))).toBe(
    false,
  );
});

test("LSProvider is never final", () => {
  expect(DefaultFinalResourceDataPredicate(resource("LSProvider"))).toBe(false);
});

test("values written once at creation are always final", () => {
  for (const name of ["Frontend/FromLocalTgz", "json/bool", "json/null", "json/errorTrace"])
    expect(StrictFinality.isFinal(resource(name, notReady))).toBe(true);
});

test("the strict layer keeps every type with a later write non-final", () => {
  for (const name of ["Blob", "Blob/fs", "BlobIndex/fs", "BlobUpload/fs", "BlobCopy/aToB"])
    expect(StrictFinality.isFinal(resource(name, filledOutput))).toBe(false);
  expect(StrictFinality.isFinal(resource("WorkingDirectory", notReady))).toBe(false);
  expect(StrictFinality.isFinal(streamManager({ error: A, fields: [] }))).toBe(false);
});

test("the cache adds the types whose only later writes are KV", () => {
  for (const name of ["Blob/fs", "BlobIndex/fs", "BlobUpload/fs", "BlobCopy/aToB"])
    expect(CacheFinality.isFinal(resource(name, filledOutput))).toBe(true);
  expect(CacheFinality.isFinal(resource("WorkingDirectory", notReady))).toBe(true);
});

test("the cache keeps a Blob and a StreamManager out: their fields change later", () => {
  expect(CacheFinality.isFinal(resource("Blob", notReady))).toBe(false);
  expect(CacheFinality.isFinal(streamManager({ error: A, fields: [] }))).toBe(false);
  expect(TreeFinality.isFinal(resource("Blob", notReady))).toBe(true);
  expect(TreeFinality.isFinal(streamManager({ error: A, fields: [] }))).toBe(true);
});

test("each layer calls final everything its parent does", () => {
  const states: Partial<ResourceData>[] = [
    {},
    notReady,
    filledOutput,
    unfilledOutput,
    { error: A },
    { ...notReady, originalResourceId: B },
    { fields: undefined },
  ];
  const typeNames = new Set<string>();
  for (const e of TreeFinality.entries)
    typeNames.add("name" in e.match ? e.match.name : e.match.prefix + "x");
  for (const name of typeNames)
    for (const state of states) {
      const r = resource(name, state);
      const strict = StrictFinality.isFinal(r);
      const cache = CacheFinality.isFinal(r);
      const tree = TreeFinality.isFinal(r);
      expect(!strict || cache, `${name} ${JSON.stringify(state)}: strict ⊆ cache`).toBe(true);
      expect(!cache || tree, `${name} ${JSON.stringify(state)}: cache ⊆ tree`).toBe(true);
    }
});
