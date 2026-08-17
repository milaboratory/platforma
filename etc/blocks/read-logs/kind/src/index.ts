import { assertDeclaredParams, defineBlockKind } from "@platforma-sdk/block-kind";
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
