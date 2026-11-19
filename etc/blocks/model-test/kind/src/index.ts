import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
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
 * Every field is optional, so what this checks is types and nothing else: a file that
 * misspells one of the five near-synonyms — `titleArgs` for `titleArg` — has that key dropped
 * by not being read, and the block initializes blank. This is where that hurts most, and it is
 * still not this kind's job to guess: a list of its own field names as strings would drift
 * from the contract above the moment a sixth field is added.
 *
 * The optional strings are checked in a loop rather than one by one, because they are the same
 * check four times over — and a fifth string field joins the list rather than needing another
 * block of its own.
 */
const OPTIONAL_STRINGS = ["titleArg", "subtitleArg", "badgeArg", "tagToWorkflow"] as const;

function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const params: BlockParams = {};
  for (const field of OPTIONAL_STRINGS) {
    const given = value[field];
    if (given === undefined) continue;
    if (typeof given !== "string") throw new Error(`'${field}' must be a string.`);
    params[field] = given;
  }

  const { tagArgs } = value;
  if (tagArgs !== undefined) {
    if (!Array.isArray(tagArgs) || tagArgs.some((tag) => typeof tag !== "string")) {
      throw new Error("'tagArgs' must be an array of strings.");
    }
    params.tagArgs = tagArgs as string[];
  }

  return params;
}

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});
