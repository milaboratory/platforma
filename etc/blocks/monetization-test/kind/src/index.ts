import { defineBlockKind } from "@platforma-sdk/block-kind";
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

export const kind = defineBlockKind<BlockParams>({ name, version });
