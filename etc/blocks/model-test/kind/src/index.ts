import { defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the model-test block — what a creator or a project
 * template supplies to seed a new instance. A subset of the model's `BlockData`:
 * every author-supplied field is a param, while `tableState` is UI view state
 * that always defaults. All optional, because a block may be created without a
 * template.
 */
export type BlockParams = {
  titleArg?: string;
  subtitleArg?: string;
  badgeArg?: string;
  tagToWorkflow?: string;
  tagArgs?: string[];
};

export const kind = defineBlockKind<BlockParams>({ name, version });
