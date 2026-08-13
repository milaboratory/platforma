import { defineBlockKind } from "@platforma-sdk/block-kind";
import { z } from "zod";
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

/**
 * The same contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * `.strict()` matters most here, where five of the fields are near-synonyms: a file
 * saying `titleArgs` or `tagArg` would otherwise be ignored key and all, the block would
 * initialize blank, and nothing would say which of the five was misspelled.
 */
const Params = z
  .object({
    titleArg: z.string().optional(),
    subtitleArg: z.string().optional(),
    badgeArg: z.string().optional(),
    tagToWorkflow: z.string().optional(),
    tagArgs: z.array(z.string()).optional(),
  })
  .strict();

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams: (value) => Params.parse(value),
});
