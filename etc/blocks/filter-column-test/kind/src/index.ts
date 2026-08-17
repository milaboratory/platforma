import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the filter-column-test block — deliberately empty.
 *
 * The block's `BlockData` is a single field, `dataset`, and it is not
 * author-supplied at creation: this fixture exists to exercise
 * `PlDatasetSelector` + `PrimaryRef` + enrichment resolution end-to-end, so the
 * selection is always made in the UI (or by a test driving `update-block-data`).
 * Nothing a creator or a project template would seed, hence no init params.
 */
export type BlockParams = Record<string, never>;

/**
 * The same contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * An empty contract has nothing to check beyond the envelope: any field a file sets is a
 * field this block does not read, so it is dropped rather than refused, and the block
 * initializes exactly as it would with no params at all.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  return {};
}

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});
