import { defineBlockKind } from "@platforma-sdk/block-kind";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the upload-file block — deliberately empty. The
 * block's `BlockData` is a single `inputHandle`, and that handle is a signed
 * path produced by a real OS file-dialog gesture on the desktop side: it cannot
 * be authored ahead of time by a creator or a project template. So there is
 * nothing meaningful to seed a fresh instance with, and `init` always returns
 * the unset default.
 */
export type BlockParams = Record<string, never>;

export const kind = defineBlockKind<BlockParams>({ name, version });
