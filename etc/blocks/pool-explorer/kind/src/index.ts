import { assertDeclaredParams, defineBlockKind } from "@platforma-sdk/block-kind";
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
 * Refusing every key is the whole point for an empty contract: a file that sets any key at
 * all is rejected naming that key, instead of having it ignored and applying a block that
 * looks configured and is not.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertDeclaredParams(value, []);

  return {};
}

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});
