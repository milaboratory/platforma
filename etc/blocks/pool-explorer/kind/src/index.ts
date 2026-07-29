import { defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the pool-explorer block — deliberately empty.
 *
 * Pool Explorer is a result-pool diagnostic: it renders every spec the pool
 * exposes and keeps its filter state local to the Vue component. There is
 * nothing a creator or a project template configures at creation time, so
 * `BlockData` carries no author-supplied fields and `init` takes no params.
 */
export type BlockParams = Record<string, never>;

export const kind = defineBlockKind<BlockParams>({ name, version });
