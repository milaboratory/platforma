import type { ImportFileHandle } from "@milaboratories/pl-model-common";
import { defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the download-file block — what a creator or a
 * project template supplies to seed a new instance. The block's `BlockData` is a
 * single field, `inputHandle`, and it is author-supplied at creation: a template
 * can pre-wire the file this block imports and re-exports. Optional, because a
 * block may also be created without a template, in which case `init` falls back
 * to an unset input.
 */
export type BlockParams = { inputHandle?: ImportFileHandle };

export const kind = defineBlockKind<BlockParams>({ name, version });
