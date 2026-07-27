import { defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * This block's init-params contract — the shape a block of this kind receives
 * at creation. Empty until the block needs author-supplied params; extend it as
 * the block grows. The block author owns this file after init.
 */
export type BlockParams = Record<string, never>;

// Identity (`name`/`version`) comes from this package's own `package.json`, so
// the on-wire `{name}@{version}` reference can never drift from what npm
// publishes; the bundler inlines the JSON import.
export const kind = defineBlockKind<BlockParams>({ name, version });
