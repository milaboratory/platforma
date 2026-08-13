import type { ImportFileHandle } from "@milaboratories/pl-model-common";
import { defineBlockKind } from "@platforma-sdk/block-kind";
import { z } from "zod";
import { name, version } from "../package.json" with { type: "json" };

/**
 * Init-params contract for the download-file block — what a creator or a
 * project template supplies to seed a new instance. The block's `BlockData` is a
 * single field, `inputHandle`, and it is author-supplied at creation: a template
 * can pre-wire the file this block imports and re-exports. Optional, because a
 * block may also be created without a template, in which case `init` falls back
 * to an unset input.
 */
export type BlockParams = { inputHandle?: ImportFileHandle };

/**
 * The same contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * `ImportFileHandle` is a template-literal union of two URI forms, so the check is the
 * prefix test rather than a plain string: a handle that carries neither scheme is not a
 * handle, and letting it through would surface much later as a failed import naming
 * nothing about the file. What cannot be checked here is whether the handle still
 * resolves — it is machine- and session-local, so only the importing side knows.
 *
 * `.strict()` rejects and names any key this contract does not declare, instead of
 * dropping it and applying a block that looks configured and is not.
 */
const ImportFileHandleParam = z.custom<ImportFileHandle>(
  (value) =>
    typeof value === "string" &&
    (value.startsWith("upload://upload/") || value.startsWith("index://index/")),
  { message: "must be an import file handle (upload://upload/… or index://index/…)" },
);

const Params = z.object({ inputHandle: ImportFileHandleParam.optional() }).strict();

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams: (value) => Params.parse(value),
});
