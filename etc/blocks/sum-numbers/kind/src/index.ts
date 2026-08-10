import { z } from "zod";
import { PlRef } from "@milaboratories/pl-model-common";
import { defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the sum-numbers block — what a creator or a
 * project template supplies to seed a new instance. The block's `BlockData` is a
 * single field, `sources`, and it is author-supplied at creation: a template can
 * pre-wire which upstream number columns this block sums. Optional, because a
 * block may also be created without a template, in which case `init` falls back
 * to an unset input.
 */
export type BlockParams = { sources?: PlRef[] };

/**
 * The same contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * The reference shape is reused from `pl-model-common` rather than restated, so a
 * hand-written entry is held to exactly what the rest of the system calls a reference
 * — including the `__isRef: true` marker the block dependency tree is rebuilt from,
 * whose absence would otherwise produce a block wired to nothing.
 *
 * `.strict()` rejects and names any key this contract does not declare, instead of
 * dropping it and applying a block that looks configured and is not.
 */
const Params = z.object({ sources: z.array(PlRef).optional() }).strict();

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseTemplateParams: (value) => Params.parse(value),
});
