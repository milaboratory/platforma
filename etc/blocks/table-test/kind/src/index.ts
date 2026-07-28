import { defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the table-test block — what a creator or a project
 * template supplies to seed a new instance. A subset of the model's `BlockData`:
 * `label` is author-supplied at creation, while `tableState` / `tableSplitState`
 * are UI view state that always defaults.
 */
export type TableTestKindParams = { label: string };

export const kind = defineBlockKind<TableTestKindParams>({ name, version });
