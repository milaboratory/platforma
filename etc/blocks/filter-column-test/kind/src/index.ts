import { assertDeclaredParams, defineBlockKind } from "@platforma-sdk/block-kind";
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
 * Refusing every key is the whole point for an empty contract: a file that sets any key at
 * all is rejected naming that key, instead of having it ignored and applying a block that
 * looks configured and is not.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertDeclaredParams(value, []);

  return {};
}

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});
