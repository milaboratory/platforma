import type { PlRef } from "@milaboratories/pl-model-common";
import { isPlRef } from "@milaboratories/pl-model-common";
import { assertDeclaredParams, defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the sum-numbers block — what a creator or a
 * project template supplies to seed a new instance. The block's `BlockData` is a
 * single field, `sources`, and it is author-supplied at creation: a template can
 * pre-wire which upstream number columns this block sums. Optional, because a
 * block may also be created without a template, in which case `init` falls back
 * to an unset input.
 */
export type BlockParams = { sources?: PlRef[] };

/**
 * The same contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * The reference check is `pl-model-common`'s own `isPlRef` rather than a restatement of the
 * shape, so a hand-written entry is held to exactly what the rest of the system calls a
 * reference — including the `__isRef: true` marker the block dependency tree is rebuilt from,
 * whose absence would otherwise produce a block wired to nothing.
 *
 * An undeclared key is refused and named, instead of dropped while a block that looks
 * configured is applied unconfigured.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertDeclaredParams(value, ["sources"]);

  const { sources } = value;
  if (sources !== undefined && !(Array.isArray(sources) && sources.every(isPlRef))) {
    throw new Error("'sources' must be an array of references to upstream columns.");
  }

  return { sources };
}

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});
