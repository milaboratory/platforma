import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
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
function parseInitializationParams(value: unknown): TableTestKindParams {
  assertParamsObject(value);

  const { label } = value;
  if (typeof label !== "string") {
    throw new Error("'label' is required, and must be a string.");
  }

  return { label };
}

export const kind = defineBlockKind<TableTestKindParams>({
  name,
  version,
  parseInitializationParams,
});
