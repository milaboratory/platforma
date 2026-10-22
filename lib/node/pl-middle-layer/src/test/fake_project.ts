import {
  createSignedResourceId,
  DefaultFinalResourceDataPredicate,
  NullSignedResourceId,
  type FieldData,
  type FieldType,
  type SignedResourceId,
} from "@milaboratories/pl-client";
import type { PColumnSpec, RunIssue } from "@milaboratories/pl-model-common";
import { PlTreeState, type ExtendedResourceData } from "@milaboratories/pl-tree";
import { argsFingerprint, type RunErrorsRecord } from "../model/args_derivation";
import {
  projectFieldName,
  ProjectStructureKey,
  type ProjectField,
  type ProjectStructure,
} from "../model/project_model";

/** What a project field holds: a resource, an error, or nothing yet. */
export type FieldContent = SignedResourceId | { error: SignedResourceId } | "unresolved";

/** Columns of a result list by name: the spec of each and the cells of its data. */
export type Columns = Record<string, { spec: PColumnSpec; cells: string[] }>;

/**
 * State of a result list: `locked` — complete; `open` — more columns may come; `failed` — it has
 * an error and will never lock.
 */
export type FrameState = { state: "locked" | "open" | "failed" };

/** The block fields a {@link FakeProject} holds. */
export type FakeProjectField = Extract<
  ProjectField["fieldName"],
  | "currentArgs"
  | "inputsValid"
  | "prodArgs"
  | "prodCtx"
  | "prodUiCtx"
  | "stagingCtx"
  | "stagingUiCtx"
>;

/** A project resource tree built in memory: its blocks, in project order, and their fields. */
export class FakeProject {
  private readonly nodes: ExtendedResourceData[] = [];
  private sent = 0;
  private readonly blocks = new Map<string, Partial<Record<FakeProjectField, FieldContent>>>();
  private readonly frameFields = new Map<SignedResourceId, FieldData[]>();

  /** Adds a block below the others, or replaces the fields of one already added. */
  block(blockId: string, fields: Partial<Record<FakeProjectField, FieldContent>>): void {
    this.blocks.set(blockId, fields);
  }

  /** Args of a block. */
  args(args: unknown): SignedResourceId {
    return this.value("json/object", args);
  }

  /** Run errors of a block found in the args `forArgs`, as its `inputsValid` field holds them. */
  runErrors(errors: readonly RunIssue[], forArgs: unknown): SignedResourceId {
    const record: RunErrorsRecord = { argsFingerprint: argsFingerprint(forArgs), errors };
    return this.value("json/object", record);
  }

  /** A ready value resource holding `json`. */
  value(type: string, json: unknown): SignedResourceId {
    const id = this.newId();
    this.nodes.push({
      ...READY,
      id,
      kind: "Value",
      type: { name: type, version: "1" },
      data: Buffer.from(JSON.stringify(json)),
      fields: [],
    });
    return id;
  }

  /** An error a resource or field can hold. */
  error(message: string): SignedResourceId {
    return this.value("json/resourceError", { message });
  }

  /** A result list exporting the given columns, each with JSON data holding `cells`. */
  frame(columns: Columns, state: FrameState = { state: "locked" }): SignedResourceId {
    const id = this.newId();
    this.frameFields.set(id, []);
    this.extend(id, columns, state);
    return id;
  }

  /** Adds columns to a result list made by {@link frame}, and moves it to `state`. */
  extend(id: SignedResourceId, columns: Columns, { state }: FrameState): void {
    const fields = this.frameFields.get(id);
    if (fields === undefined) throw new Error("Not a result list of this project");
    for (const [name, { spec, cells }] of Object.entries(columns)) {
      const data = Object.fromEntries(cells.map((cell, i) => [`["s${i}"]`, cell]));
      fields.push(field("Input", `${name}.spec`, this.value("PColumnSpec", spec)));
      fields.push(
        field("Input", `${name}.data`, this.value("PColumnData/Json", { keyLength: 1, data })),
      );
    }
    const error = state === "failed" ? this.error("render failed") : NullSignedResourceId;
    this.nodes.push({
      ...READY,
      id,
      kind: "Structural",
      type: { name: "PFrame", version: "1" },
      inputsLocked: state === "locked",
      resourceReady: state === "locked",
      final: state === "locked",
      error,
      fields: [...fields],
    });
  }

  /** The tree of the project as it is now. */
  tree(): PlTreeState {
    const tree = new PlTreeState(ROOT_ID, DefaultFinalResourceDataPredicate);
    tree.updateFromResourceData(this.changes());
    return tree;
  }

  /**
   * The project resource and the resources added or changed since the last call: a final
   * resource already in the tree is not sent again.
   */
  changes(): ExtendedResourceData[] {
    const structure: ProjectStructure = {
      groups: [
        {
          id: "main",
          label: "Main",
          blocks: [...this.blocks.keys()].map((id) => ({ id, label: id, renderingMode: "Heavy" })),
        },
      ],
    };
    const fields = [...this.blocks].flatMap(([blockId, contents]) =>
      PROJECT_FIELDS.flatMap((name) => {
        const content = contents[name];
        return content === undefined
          ? []
          : [projectField(projectFieldName(blockId, name), content)];
      }),
    );
    const root: ExtendedResourceData = {
      ...READY,
      final: false,
      id: ROOT_ID,
      kind: "Structural",
      type: { name: "UserProject", version: "2" },
      fields,
      kv: [{ key: ProjectStructureKey, value: Buffer.from(JSON.stringify(structure)) }],
    };
    const added = this.nodes.slice(this.sent);
    this.sent = this.nodes.length;
    return [root, ...added];
  }

  private newId(): SignedResourceId {
    return createSignedResourceId(nextResourceId++);
  }
}

// Internals

const ROOT_ID = createSignedResourceId(1_000_001n);

/**
 * Resource ids stay unique across tests, as they are on a backend: the middle layer caches the
 * columns an args resource references by its id.
 */
let nextResourceId = 100n;

const READY: Omit<ExtendedResourceData, "id" | "kind" | "type" | "fields"> = {
  originalResourceId: NullSignedResourceId,
  error: NullSignedResourceId,
  inputsLocked: true,
  outputsLocked: true,
  resourceReady: true,
  final: true,
  kv: [],
};

const PROJECT_FIELDS: readonly FakeProjectField[] = [
  "currentArgs",
  "inputsValid",
  "prodArgs",
  "prodCtx",
  "prodUiCtx",
  "stagingCtx",
  "stagingUiCtx",
];

function field(type: FieldType, name: string, value: SignedResourceId): FieldData {
  return { name, type, value, error: NullSignedResourceId, status: "Resolved", valueIsFinal: true };
}

function projectField(name: string, content: FieldContent): FieldData {
  if (content === "unresolved") {
    return {
      name,
      type: "Dynamic",
      value: NullSignedResourceId,
      error: NullSignedResourceId,
      status: "Empty",
      valueIsFinal: false,
    };
  }
  if (typeof content === "object" && "error" in content) {
    return {
      name,
      type: "Dynamic",
      value: NullSignedResourceId,
      error: content.error,
      status: "Resolved",
      valueIsFinal: true,
    };
  }
  return field("Dynamic", name, content);
}
