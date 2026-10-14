import type { BlockPackSpecAny } from "@milaboratories/pl-middle-layer";
import { createPlDataTableStateV2 } from "@platforma-sdk/model";
import { randomUUID } from "node:crypto";
import * as fsp from "node:fs/promises";
import path from "node:path";
import type { BlockTestCtx } from "./test-block";
import { awaitBlockDone } from "./test-block";
import type { XsvImportSpec } from "./fixtures/xsv-spec";

export type PublishXsvOptions = {
  /** Block label in the project; also seeds the uploaded file's name. */
  label: string;
  /** The xsv-import block to add: its published pointer, or `dev-v2` on a local build. */
  block: BlockPackSpecAny;
  /** Column spec the block imports the file with. */
  spec: XsvImportSpec;
  /** File body, header row included. */
  content: string;
  ext?: "tsv" | "csv";
  /** Wait for the import to finish, ms. */
  timeout?: number;
};

export const XSV_IMPORT_OUTPUT = "outputPf";

/**
 * Publish a table into the result pool through an xsv-import block. Returns the publisher's
 * block id; its columns are reachable as `exportedRef(blockId, "outputPf", <column>)`.
 *
 * One publisher must carry every column a consumer matches together: a block's workflow
 * resolves only the blocks its args reference by PlRef, so a column anchored on another
 * column has to live in the same publisher as that anchor.
 */
export async function publishXsv(ctx: BlockTestCtx, opts: PublishXsvOptions): Promise<string> {
  const ext = opts.ext ?? "tsv";
  // One file per publish: the uploader checks the file's mtime, so two publishes of the same
  // content must never share a path.
  const file = path.join(
    ctx.tmpFolder,
    `${opts.label.replace(/\W+/g, "_")}-${randomUUID()}.${ext}`,
  );
  await fsp.writeFile(file, opts.content);
  const blockId = await ctx.rawPrj.addBlock(opts.label, opts.block);
  const fileHandle = await ctx.helpers.getLocalFileHandle(file);
  await ctx.rawPrj.mutateBlockStorage(blockId, {
    operation: "update-block-data",
    value: { fileHandle, spec: opts.spec, tableState: createPlDataTableStateV2() },
  });
  await ctx.rawPrj.runBlock(blockId);
  await awaitBlockDone(ctx.rawPrj, blockId, {
    timeout: opts.timeout ?? 90_000,
    observeState: true,
  });
  return blockId;
}
