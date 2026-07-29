import { defineBlockKind } from "@platforma-sdk/block-kind";
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

export const kind = defineBlockKind<BlockParams>({ name, version });
