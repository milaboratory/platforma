import { expect, test } from "vitest";
import {
  DefaultFinalResourceDataPredicate,
  DefaultResourceCachePredicate,
  resourceCachePredicate,
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
// The finality table (ruled 2026-09-30): each change against the table before it.
//

function resource(typeName: string, patch: Partial<ResourceData> = {}): ResourceData {
  return streamManager({ type: { name: typeName, version: "1" }, ...patch });
}

const notReady: Partial<ResourceData> = {
  resourceReady: false,
  inputsLocked: false,
  outputsLocked: false,
};

test("less final: BResolveSingle and BResolveChoice are never final", () => {
  // outputs are filled by the context resolver after ready, and are never locked on success
  for (const name of ["BResolveSingle", "BResolveChoice"])
    expect(DefaultFinalResourceDataPredicate(resource(name))).toBe(false);
});

test("BResolveSingleNoResult keeps readyOrDuplicateOrError", () => {
  expect(DefaultFinalResourceDataPredicate(resource("BResolveSingleNoResult"))).toBe(true);
  expect(DefaultFinalResourceDataPredicate(resource("BResolveSingleNoResult", notReady))).toBe(
    false,
  );
});

test("less final: LSProvider is never final", () => {
  // its storage fields change on a controller restart with a new storage config
  expect(DefaultFinalResourceDataPredicate(resource("LSProvider"))).toBe(false);
});

test("more final: values written once at creation are always final", () => {
  for (const name of ["Frontend/FromLocalTgz", "json/bool", "json/null", "json/errorTrace"])
    expect(DefaultFinalResourceDataPredicate(resource(name, notReady))).toBe(true);
});

test("BlobCopy stays never final: nothing locks its outputs", () => {
  const done = resource("BlobCopy/mainToLibrary", {
    fields: [field("incarnation", A)],
  });
  expect(DefaultFinalResourceDataPredicate(done)).toBe(false);
});

test("the resource cache excludes types whose fields change after tree-final", () => {
  const blob = resource("Blob", notReady);
  const errored = streamManager({ error: A, fields: [] });
  expect(DefaultFinalResourceDataPredicate(blob)).toBe(true);
  expect(DefaultFinalResourceDataPredicate(errored)).toBe(true);
  expect(DefaultResourceCachePredicate(blob)).toBe(false);
  expect(DefaultResourceCachePredicate(errored)).toBe(false);
});

test("the resource cache keeps tree-final types whose later writes are KV only", () => {
  // the cache holds state and fields, never KV
  for (const name of ["Blob/fs", "WorkingDirectory", "json/object"])
    expect(DefaultResourceCachePredicate(resource(name, notReady))).toBe(true);
  expect(DefaultResourceCachePredicate(resource("StdMap"))).toBe(true);
  expect(DefaultResourceCachePredicate(resource("StdMap", notReady))).toBe(false);
});

test("a cache predicate derived from an overridden tree predicate keeps the exclusions", () => {
  const cache = resourceCachePredicate(() => true);
  expect(cache(resource("SomeType"))).toBe(true);
  expect(cache(resource("Blob"))).toBe(false);
  expect(cache(resource("StreamManager"))).toBe(false);
});
