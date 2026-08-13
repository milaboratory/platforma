import { defineBlockKind } from "@platforma-sdk/block-kind";
import { z } from "zod";
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
 * `.strict()` is the whole point for an empty contract: it turns a file that sets any
 * key at all into a rejection naming that key, instead of ignoring it and applying a
 * block that looks configured and is not.
 */
const Params = z.object({}).strict();

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams: (value) => Params.parse(value),
});
