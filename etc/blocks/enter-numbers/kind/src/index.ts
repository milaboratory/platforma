import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the enter-numbers block — what a creator or a project
 * template supplies to seed a new instance. A subset of the model's `BlockData`:
 * `numbers` is the block's author-supplied input, while `labels` and
 * `description` exist only for the v1→v2→v3 migration chain to populate, and
 * always default. Optional, because a block may be created without a template.
 */
export type BlockParams = { numbers?: number[] };

/**
 * The same contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * Only `numbers` is looked at, because it is the only field this block reads. A file setting
 * anything else says nothing to this kind and is dropped by not being read — including
 * `number:`, singular, which is the typo this contract invites. That one is not caught here:
 * the complaint arrives later from the block's own `args()`, saying "Numbers are required!"
 * and naming nothing about the typo. Catching it would mean this kind keeping a list of its
 * own field names as strings, which nothing would hold in step with the type above.
 *
 * The type argument to `defineBlockKind` keeps the two in step for the fields that are read:
 * this function has to return `BlockParams`, so dropping a field it declares is a compile
 * error.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const { numbers } = value;
  if (numbers !== undefined && !isNumberArray(numbers)) {
    throw new Error("'numbers' must be an array of numbers.");
  }

  return { numbers };
}

function isNumberArray(value: unknown): value is number[] {
  // `Number.isFinite` rather than `typeof`: YAML admits `.nan` and `.inf`, and a block that
  // sums its input has nothing to do with either.
  return Array.isArray(value) && value.every((item) => Number.isFinite(item));
}

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});
