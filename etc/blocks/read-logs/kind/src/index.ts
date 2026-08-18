import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the read-logs block — deliberately empty.
 *
 * The block's `BlockData` is two fields, and neither is something a creator or a
 * project template could seed. `inputHandle` is a desktop-signed
 * `ImportFileHandle` — a machine- and session-local reference produced by a real
 * OS file-dialog gesture (see the upload flow), not serializable ahead of time.
 * `readFileWithSleepArgs` is a fixture knob for the log-emitting test tool
 * (prefix / line count / sleep), always driven from the UI or by a test. So this
 * block takes no init params and `init` always returns the defaults.
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
