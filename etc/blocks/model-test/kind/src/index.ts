import { assertDeclaredParams, defineBlockKind } from "@platforma-sdk/block-kind";
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
 * Refusing an undeclared key matters most here, where all five fields are near-synonyms: a
 * file saying `titleArgs` or `tagArg` would otherwise be ignored key and all, the block would
 * initialize blank, and nothing would say which of the five was misspelled.
 *
 * The optional strings are checked in a loop rather than one by one, because they are the same
 * check five times over — and a sixth field added to the contract joins the list rather than
 * needing another block of its own.
 */
const OPTIONAL_STRINGS = ["titleArg", "subtitleArg", "badgeArg", "tagToWorkflow"] as const;

function parseInitializationParams(value: unknown): BlockParams {
  assertDeclaredParams(value, [...OPTIONAL_STRINGS, "tagArgs"]);

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
