import type { PlRef } from "@milaboratories/pl-model-common";
import { defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the sum-numbers-v3 block — what a creator or a
 * project template supplies to seed a new instance. The block's `BlockData` is a
 * single field, `sources`, and it is author-supplied at creation: a template can
 * pre-wire which upstream number columns this block sums. Optional, because a
 * block may also be created without a template, in which case `init` falls back
 * to an unset input.
 */
export type BlockParams = { sources?: PlRef[] };

export const kind = defineBlockKind<BlockParams>({ name, version });
