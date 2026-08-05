import { defineBlockKind } from "@platforma-sdk/block-kind";
import { z } from "zod";
import { name, version } from "../package.json" with { type: "json" };

/**
 * This block's init-params contract — the shape a block of this kind receives
 * at creation, and exactly what a project template serializes for it.
 *
 * TODO(block-kind): replace `NEEDS_BLOCK_PARAMS` with the real params shape, then
 * wire the model's `init(({ params }) => …)` to consume them. If this block takes
 * no author-supplied params, set it to `Record<string, never>` deliberately.
 *
 * This is an intentional sentinel: `NEEDS_BLOCK_PARAMS` is an undefined type, so
 * the block fails to typecheck (TS2304) until the contract is chosen on purpose.
 * A scaffolded-but-unmigrated block must never compile with an empty contract by
 * default — see the block-kind migration recipe in the `block-dev` skill.
 */
export type BlockParams = NEEDS_BLOCK_PARAMS;

/**
 * The same contract at runtime, for params that arrive from a template file rather than
 * from typed code — the only point that can catch a hand-written entry being wrong.
 *
 * TODO(block-kind): mirror `BlockParams` here. Keep `.strict()`: it is what turns a
 * misspelled key into a rejection naming that key, instead of one silently ignored while
 * the block initializes blank.
 *
 * This is a second intentional sentinel. The schema has to produce `BlockParams`, so an
 * empty one stops compiling the moment the contract declares a required field — the check
 * cannot drift from the contract by being left behind. zod is the default; any function
 * from `unknown` to `BlockParams` satisfies the slot, including a hand-written one.
 */
const Params = z.object({}).strict();

// Identity (`name`/`version`) comes from this package's own `package.json`, so
// the on-wire `{name}@{version}` reference can never drift from what npm
// publishes; the bundler inlines the JSON import.
export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseTemplateParams: (value) => Params.parse(value),
});
