import { defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the table-test block. The block self-initializes
 * (no external params), so the contract is empty for now — the kind still
 * carries the block's identity and version.
 */
export type TableTestKindParams = Record<string, never>;

export const kind = defineBlockKind<TableTestKindParams>({ name, version });
