import { defineBlockKind } from "@platforma-sdk/block-kind";
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

// Identity (`name`/`version`) comes from this package's own `package.json`, so
// the on-wire `{name}@{version}` reference can never drift from what npm
// publishes; the bundler inlines the JSON import.
export const kind = defineBlockKind<BlockParams>({ name, version });
