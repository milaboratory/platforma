import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the transfer-files block — deliberately empty. The
 * block's `BlockData` is a single `inputHandles` list, and every entry is a
 * signed path produced by a real OS file-dialog gesture on the desktop side: it
 * cannot be authored ahead of time by a creator or a project template. So there
 * is nothing meaningful to seed a fresh instance with, and `init` always returns
 * the empty list.
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
