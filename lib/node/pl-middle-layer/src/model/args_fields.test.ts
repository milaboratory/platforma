import { Computable } from "@milaboratories/computable";
import {
  createSignedResourceId,
  DefaultFinalResourceDataPredicate,
  NullSignedResourceId,
  Pl,
  type FieldData,
  type SignedResourceId,
} from "@milaboratories/pl-client";
import {
  PlTreeState,
  type ExtendedResourceData,
  type PlTreeNodeAccessor,
} from "@milaboratories/pl-tree";
import { describe, expect, test } from "vitest";
import { readArgsField, readArgsIssues } from "./args_fields";
import { modelFingerprint, storageFingerprint } from "./derived_args";
import { projectFieldName, type ProjectField } from "./project_model";

const storage = '{"__pl_a7f3e2b9__":"v1","__dataVersion":1,"__data":{"abundance":null}}';
const editedStorage = '{"__pl_a7f3e2b9__":"v1","__dataVersion":1,"__data":{"abundance":"a"}}';
const modelCode = "model v1";
const source = {
  storageHash: storageFingerprint(storage),
  modelHash: modelFingerprint({ code: { type: "plain", content: modelCode } }),
};

const error = { severity: "error", message: "Abundance is required" };
const warning = { severity: "warning", message: "Few samples" };
const draft = { abundance: null };

describe("readArgsField", () => {
  test("a draft is read while there are no current args and its errors are of the block now", async () => {
    const prj = project({ currentDraftArgs: draft, currentArgsIssues: record([error]) });

    expect(
      await read(prj, (p) => readArgsField(p, "b", "currentDraftArgs")?.getDataAsJson()),
    ).toEqual(draft);
  });

  test("a draft next to current args is not read", async () => {
    const prj = project({
      currentArgs: { abundance: "a" },
      currentDraftArgs: draft,
      currentArgsIssues: record([error]),
    });

    expect(await read(prj, (p) => readArgsField(p, "b", "currentDraftArgs"))).toBeUndefined();
  });

  test("a draft without errors next to it is not read", async () => {
    const withWarnings = project({ currentDraftArgs: draft, currentArgsIssues: record([warning]) });
    const withoutIssues = project({ currentDraftArgs: draft });

    expect(
      await read(withWarnings, (p) => readArgsField(p, "b", "currentDraftArgs")),
    ).toBeUndefined();
    expect(
      await read(withoutIssues, (p) => readArgsField(p, "b", "currentDraftArgs")),
    ).toBeUndefined();
  });

  test("a draft left behind for storage the block no longer holds is not read", async () => {
    const prj = project(
      { currentDraftArgs: draft, currentArgsIssues: record([error]) },
      { storage: editedStorage },
    );

    expect(await read(prj, (p) => readArgsField(p, "b", "currentDraftArgs"))).toBeUndefined();
  });

  test("a draft left behind by another model of the block is not read", async () => {
    const prj = project(
      { currentDraftArgs: draft, currentArgsIssues: record([error]) },
      { modelCode: "model v2" },
    );

    expect(await read(prj, (p) => readArgsField(p, "b", "currentDraftArgs"))).toBeUndefined();
  });

  test("the prerun draft is gated by the prerun issues alone", async () => {
    const prj = project({
      currentArgs: { abundance: "a" },
      currentDraftPrerunArgs: draft,
      currentPrerunArgsIssues: record([error]),
    });

    expect(
      await read(prj, (p) => readArgsField(p, "b", "currentDraftPrerunArgs")?.getDataAsJson()),
    ).toEqual(draft);
    expect(await read(prj, (p) => readArgsField(p, "b", "currentDraftArgs"))).toBeUndefined();
  });

  test("fields other than drafts are read as they are", async () => {
    const prj = project({ stagingArgs: { abundance: "old" }, prodArgs: { abundance: "older" } });

    expect(await read(prj, (p) => readArgsField(p, "b", "stagingArgs")?.getDataAsJson())).toEqual({
      abundance: "old",
    });
    expect(await read(prj, (p) => readArgsField(p, "b", "prodArgs")?.getDataAsJson())).toEqual({
      abundance: "older",
    });
    expect(await read(prj, (p) => readArgsField(p, "b", "currentArgs"))).toBeUndefined();
  });
});

describe("readArgsIssues", () => {
  test("issues found for the storage and the model the block holds are read", async () => {
    const prj = project({
      currentArgsIssues: record([error, warning]),
      currentPrerunArgsIssues: record([warning]),
    });

    expect(await read(prj, (p) => readArgsIssues(p, "b", "args"))).toEqual([error, warning]);
    expect(await read(prj, (p) => readArgsIssues(p, "b", "prerun"))).toEqual([warning]);
  });

  test("a block with no issues field has none", async () => {
    expect(await read(project({}), (p) => readArgsIssues(p, "b", "args"))).toEqual([]);
  });

  test("issues found for other storage or by another model are none", async () => {
    const fields = { currentArgsIssues: record([error]) };

    expect(
      await read(project(fields, { storage: editedStorage }), (p) =>
        readArgsIssues(p, "b", "args"),
      ),
    ).toEqual([]);
    expect(
      await read(project(fields, { modelCode: "model v2" }), (p) => readArgsIssues(p, "b", "args")),
    ).toEqual([]);
  });

  test("a record of an unknown shape is no issues", async () => {
    const prj = project({ currentArgsIssues: [error] });

    expect(await read(prj, (p) => readArgsIssues(p, "b", "args"))).toEqual([]);
  });
});

// Internals

const ArgsFieldNames = [
  "currentArgs",
  "currentDraftArgs",
  "currentArgsIssues",
  "prodArgs",
  "currentPrerunArgs",
  "currentDraftPrerunArgs",
  "currentPrerunArgsIssues",
  "stagingArgs",
] as const;

type ArgsFieldContent = Partial<Record<(typeof ArgsFieldNames)[number], unknown>>;

// Fingerprints are cached by resource id for the whole process, so no two resources of any
// project built here share an id.
let nextResourceId = 1n;

function record(issues: unknown[]) {
  return { ...source, issues };
}

/**
 * A project with one block `b`, holding `fields` as JSON values next to its storage and its block
 * pack. The storage and the model code default to the ones `source` fingerprints.
 */
function project(
  fields: ArgsFieldContent,
  block: { storage?: string; modelCode?: string } = {},
): PlTreeState {
  const newId = () => createSignedResourceId(nextResourceId++);
  const rootId = newId();
  const resources: ExtendedResourceData[] = [];
  const rootFields: FieldData[] = [];

  const addValue = (fieldName: ProjectField["fieldName"], content: unknown) => {
    const id = newId();
    resources.push(valueResource(id, JSON.stringify(content)));
    rootFields.push(field("Dynamic", projectFieldName("b", fieldName), id));
  };

  addValue("blockStorage", JSON.parse(block.storage ?? storage));
  for (const name of ArgsFieldNames) {
    if (name in fields) addValue(name, fields[name]);
  }

  const packId = newId();
  resources.push(
    valueResource(
      packId,
      JSON.stringify({
        source: { type: "dev-v2", folder: "/blocks/b" },
        config: {
          v4: {
            outputs: {},
            renderingMode: "Heavy",
            sdkVersion: "1.0.0",
            sections: {},
            blockLifecycleCallbacks: {},
          },
          code: { type: "plain", content: block.modelCode ?? modelCode },
        },
      }),
    ),
  );
  const holderId = newId();
  resources.push({
    ...structural(holderId, { name: "Holder", version: "1" }),
    fields: [field("Input", Pl.HolderRefField, packId)],
  });
  rootFields.push(field("Dynamic", projectFieldName("b", "blockPack"), holderId));

  resources.push({
    ...structural(rootId, { name: "UserProject", version: "2" }),
    fields: rootFields,
  });

  const state = new PlTreeState(rootId, DefaultFinalResourceDataPredicate);
  state.updateFromResourceData(resources);
  return state;
}

async function read<T>(state: PlTreeState, fn: (prj: PlTreeNodeAccessor) => T) {
  return await Computable.make((ctx) => fn(ctx.accessor(state.entry()).node())).getValue();
}

function ready() {
  return {
    originalResourceId: NullSignedResourceId,
    error: NullSignedResourceId,
    inputsLocked: true,
    outputsLocked: true,
    resourceReady: true,
    final: true,
    kv: [],
  };
}

function valueResource(id: SignedResourceId, json: string): ExtendedResourceData {
  return {
    ...ready(),
    id,
    kind: "Value",
    type: { name: "json/object", version: "1" },
    data: Buffer.from(json),
    fields: [],
  };
}

function structural(id: SignedResourceId, type: { name: string; version: string }) {
  return { ...ready(), id, kind: "Structural" as const, type };
}

function field(type: "Dynamic" | "Input", name: string, value: SignedResourceId): FieldData {
  return { name, type, value, error: NullSignedResourceId, status: "Resolved", valueIsFinal: true };
}
