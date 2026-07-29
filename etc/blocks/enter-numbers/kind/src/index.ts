import { defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the enter-numbers block — what a creator or a project
 * template supplies to seed a new instance. A subset of the model's `BlockData`:
 * `numbers` is the block's author-supplied input, while `labels` and
 * `description` exist only for the v1→v2→v3 migration chain to populate, and
 * always default. Optional, because a block may be created without a template.
 */
export type BlockParams = { numbers?: number[] };

export const kind = defineBlockKind<BlockParams>({ name, version });
