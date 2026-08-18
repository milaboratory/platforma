import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the blob-url-custom-protocol block — deliberately
 * empty. The block's whole `BlockData` is two `ImportFileHandle`s, and those are
 * desktop-signed, machine- and session-local references produced by a real OS
 * file-dialog gesture (see the upload flow). Nothing a creator or a project
 * template could serialize ahead of time, so this block takes no init params and
 * `init` always returns the unset defaults.
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
