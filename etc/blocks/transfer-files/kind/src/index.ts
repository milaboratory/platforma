import { defineBlockKind } from "@platforma-sdk/block-kind";
import { z } from "zod";
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
 * `.strict()` is the whole point for an empty contract: it turns a file that sets any
 * key at all into a rejection naming that key, instead of ignoring it and applying a
 * block that looks configured and is not.
 */
const Params = z.object({}).strict();

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseTemplateParams: (value) => Params.parse(value),
});
