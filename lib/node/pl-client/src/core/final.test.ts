import { expect, test } from "vitest";
import { DefaultFinalResourceDataPredicate } from "./final";
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

test("a StreamManager whose fields were pruned away is not final, and does not throw", () => {
  expect(DefaultFinalResourceDataPredicate(streamManager({ fields: [] }))).toBe(false);
  expect(DefaultFinalResourceDataPredicate(streamManager({ fields: [field("stream", A)] }))).toBe(
    false,
  );
});

test("a StreamManager is final once stream and downloadable agree", () => {
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
