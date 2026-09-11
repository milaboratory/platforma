import * as v from "valibot";

//
// Workflow + BlockComponents canonical TS types.
//

/**
 * Wrapped workflow component, schema version 1. Currently the only workflow
 * schema; carries a single `main` entry pointing at the workflow source.
 */
export type WorkflowV1<Content> = {
  type: "workflow-v1";
  main: Content;
};

/**
 * Current workflow component shape. Alias to `WorkflowV1` while v1 is the
 * only version — future versions widen this to a discriminated union.
 */
export type Workflow<Content> = WorkflowV1<Content>;

/**
 * Trio of artifacts every block ships: a workflow (Tengo source), a model
 * (compiled JS), and a UI (front-end bundle). `WMContent` carries
 * `workflow.main` and `model` together (they travel as files); `UIContent`
 * carries the UI bundle (a folder when resolved locally, a relative path in
 * manifest form). Parameterizing this lets the same shape express every
 * stage the description passes through: raw `package.json` input (bare
 * strings), manifest form (relative paths stored in the registry), resolved
 * absolute form (local file/folder paths), and the registry-reader output
 * (URLs into registry storage, produced by `blockComponentsManifestToAbsoluteUrl`).
 */
export type BlockComponents<WMContent, UIContent> = {
  workflow: Workflow<WMContent>;
  model: WMContent;
  ui: UIContent;
};

/**
 * Builds the valibot schema for a wrapped workflow component carrying
 * `content` as the `main` payload. Shared between the `package.json` boundary
 * parser (where `content` is `v.string()`) and the manifest schema (where
 * `content` is `ContentRelative`).
 */
export function WorkflowSchemaV1<const C extends v.GenericSchema>(content: C) {
  return v.strictObject({
    type: v.literal("workflow-v1"),
    main: content,
  });
}

//
// `package.json` boundary schema. The workflow field accepts either a bare
// string (treated as `main`) or the wrapped object form; both normalize to
// the canonical wrapped shape.
//

const WorkflowDescriptionRaw = v.union([
  v.pipe(
    v.string(),
    v.transform(
      (value): WorkflowV1<string> => ({
        type: "workflow-v1",
        main: value,
      }),
    ),
  ),
  WorkflowSchemaV1(v.string()),
]) satisfies v.GenericSchema<unknown, Workflow<string>>;

export type BlockComponentsDescriptionRaw = BlockComponents<string, string>;

export const BlockComponentsDescriptionRaw = v.object({
  workflow: WorkflowDescriptionRaw,
  model: v.string(),
  ui: v.string(),
}) satisfies v.GenericSchema<unknown, BlockComponentsDescriptionRaw>;
