import { defineBlockKind } from "@platforma-sdk/block-kind";
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

export const kind = defineBlockKind<BlockParams>({ name, version });
