import { defineBlockKind } from "@platforma-sdk/block-kind";
import { z } from "zod";
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
 * `.strict()` is the whole point for an empty contract: it turns a file that sets any
 * key at all into a rejection naming that key, instead of ignoring it and applying a
 * block that looks configured and is not.
 */
const Params = z.object({}).strict();

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseTemplateParams: (value) => Params.parse(value),
});
