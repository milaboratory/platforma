import { defineBlockKind } from "@platforma-sdk/block-kind";
import { z } from "zod";
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
