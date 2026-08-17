import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the monetization-test block — deliberately empty.
 * Nothing in this block's `BlockData` is meaningfully author-supplied at
 * creation: `inputHandles` carries desktop-signed `ImportFileHandle`s that only
 * a real OS file-dialog gesture can produce, `productKey` and
 * `shouldAddRunPerFile` are fixture knobs the tester flips in the UI, and
 * `__mnzDate` / `__mnzCanRun` are owned by the SDK's monetization plugin. So
 * `init` ignores params and returns the fixture defaults.
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
