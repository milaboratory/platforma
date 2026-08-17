import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
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

/**
 * The same contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * An empty contract has nothing to check beyond the envelope: any field a file sets is a
 * field this block does not read, so it is dropped rather than refused, and the block
 * initializes exactly as it would with no params at all.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  return {};
}

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});
