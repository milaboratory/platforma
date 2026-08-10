import { defineBlockKind } from "@platforma-sdk/block-kind";
import { z } from "zod";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the table-test block — what a creator or a project
 * template supplies to seed a new instance. A subset of the model's `BlockData`:
 * `label` is author-supplied at creation, while `tableState` / `tableSplitState`
 * are UI view state that always defaults.
 */
export type TableTestKindParams = { label: string };

/**
 * The same contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * `label` is the one required field in the workspace fixtures, so this is where a
 * missing key is caught: without the check an entry omitting it would initialize the
 * block with `undefined` where a string is declared, and the mismatch would only show
 * up wherever that label is rendered.
 */
const Params = z.object({ label: z.string() }).strict();

export const kind = defineBlockKind<TableTestKindParams>({
  name,
  version,
  parseTemplateParams: (value) => Params.parse(value),
});
