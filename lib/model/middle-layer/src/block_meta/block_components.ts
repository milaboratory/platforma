import { z } from "zod";

//
// Workflow + BlockComponents canonical TS types.
//
// Manifest form is always the wrapped `{type: "workflow-v1", main: ...}` shape.
// Authors may write a bare value in `package.json`; the boundary schema below
// normalizes that to the wrapped form.
//

export type WorkflowV1<Content> = {
  type: "workflow-v1";
  main: Content;
};

export type Workflow<Content> = WorkflowV1<Content>;

export type BlockComponents<WfAndModel, UI> = {
  workflow: Workflow<WfAndModel>;
  model: WfAndModel;
  ui: UI;
};

//
// Package.json boundary schema.
//
// Workflow field accepts either a bare string or the wrapped object;
// both normalize to `{type: "workflow-v1", main: <string>}`.
//

const WorkflowDescriptionRaw = z.union([
  z.string().transform<WorkflowV1<string>>((value) => ({
    type: "workflow-v1",
    main: value,
  })),
  z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("workflow-v1"),
        main: z.string().describe("Main workflow"),
      })
      .strict(),
  ]),
]) satisfies z.ZodType<Workflow<string>, z.ZodTypeDef, any>;

export type BlockComponentsDescriptionRaw = BlockComponents<string, string>;

export const BlockComponentsDescriptionRaw = z.object({
  workflow: WorkflowDescriptionRaw,
  model: z.string(),
  ui: z.string(),
}) satisfies z.ZodType<BlockComponentsDescriptionRaw, z.ZodTypeDef, any>;
