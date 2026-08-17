import { assertDeclaredParams, defineBlockKind } from "@platforma-sdk/block-kind";
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
 * TODO(block-kind): list every key `BlockParams` declares in the `assertDeclaredParams`
 * call, then read each one and say what it must be. Plain TypeScript is the default here:
 * a kind owes no schema library, and a check written by hand is held to the contract by
 * the return type. Reach for a validation library only where the shape earns it, and add
 * it to this package's dependencies yourself.
 *
 * This is a second intentional sentinel. The function has to return `BlockParams`, so
 * `return {}` stops compiling the moment the contract declares a required field — the check
 * cannot drift from the contract by being left behind. Never satisfy it with a cast: `value
 * as BlockParams` compiles today and checks nothing forever.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertDeclaredParams(value, []);

  return {};
}

// Identity (`name`/`version`) comes from this package's own `package.json`, so
// the on-wire `{name}@{version}` reference can never drift from what npm
// publishes; the bundler inlines the JSON import.
export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});
