import type { ImportFileHandle } from "@milaboratories/pl-model-common";
import { assertParamsObject, defineBlockKind } from "@platforma-sdk/block-kind";
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
 * `ImportFileHandle` is a template-literal union of two URI forms, so the check is the prefix
 * test rather than a plain string: a handle that carries neither scheme is not a handle, and
 * letting it through would surface much later as a failed import naming nothing about the
 * file. What cannot be checked here is whether the handle still resolves — it is machine- and
 * session-local, so only the importing side knows.
 *
 * `inputHandle` is the only field read, so anything else a file sets is dropped by not being
 * read — which for this block means a handle that never arrives and an import with no input,
 * the same state a block created without a template starts in.
 */
function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const { inputHandle } = value;
  if (inputHandle !== undefined && !isImportFileHandle(inputHandle)) {
    throw new Error(
      "'inputHandle' must be an import file handle (upload://upload/… or index://index/…).",
    );
  }

  return { inputHandle };
}

function isImportFileHandle(value: unknown): value is ImportFileHandle {
  return (
    typeof value === "string" &&
    (value.startsWith("upload://upload/") || value.startsWith("index://index/"))
  );
}

export const kind = defineBlockKind<BlockParams>({
  name,
  version,
  parseInitializationParams,
});
