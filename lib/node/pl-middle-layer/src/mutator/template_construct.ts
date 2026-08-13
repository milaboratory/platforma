import { BLOCK_STORAGE_FACADE_VERSION, extractConfig } from "@platforma-sdk/model";
import { resolveTemplateRefs, type ProjectTemplateV1 } from "@milaboratories/pl-model-common";
import type { BlockPackSpecPrepared } from "../model";
import type { ProjectHelper } from "../model/project_helper";
import type { AppliedEntry } from "../model/template_apply";
import { TemplateEntryRejected } from "../model/template_apply";
import { randomUUID } from "node:crypto";
import type { Block } from "../model/project_model";
import type { NewBlockSpec } from "./project";

/** What construction needs to know about one entry, once its block has been located. */
export type PreparedTemplateEntry = {
  /** The block pack, already prepared and template-cached. */
  readonly blockPack: BlockPackSpecPrepared;
  /**
   * The label to place the block under: the block package's published title.
   *
   * A template names no block instances, so this cannot come from the file — and must
   * not be derived from it, since an exported template names its entries by the source
   * project's block ids. It reaches here from resolution, the only stage that talks to
   * a registry.
   *
   * A block whose model derives a title shows that instead (`project_overview.ts`
   * prefers the derived one), so for most blocks this is invisible. For the ones that
   * derive none it is the name the user reads.
   */
  readonly label: string;
};

/** The one method construction needs from a project mutator. */
export type BlockPlacer = {
  addBlock: (block: Block, spec: NewBlockSpec, before?: string) => void;
};

/**
 * Apply a `template-v1` document: create each entry's block, in file order.
 *
 * Everything slow is already done by the time this runs: kinds resolved, block packs
 * prepared and template-cached, the project created and a mutator open. What is left per
 * entry is in-memory work — assign an id, redirect the entry's references against the ids
 * already handed out, ask the block's own model for the storage those params imply, and
 * place the block. All of it inside the caller's single transaction.
 *
 * File order is instantiation order, and a reference to a later entry is rejected before
 * this point, so one forward pass is enough: by the time an entry is created, every entry it
 * references already exists and already has an id. Blocks are appended in the order they are
 * added, so nothing here passes a `before`.
 *
 * **All or nothing.** An entry this project cannot honour throws
 * {@link TemplateEntryRejected}, which leaves the caller's transaction uncommitted, so the
 * project keeps none of the blocks this call placed. A half-applied project is not a useful
 * result: its tail is missing, so whatever the missing entries were supposed to feed is wired
 * to nothing, and the user cannot tell which of the blocks present were configured by the
 * file and which they would have to fix. Failing whole also means the reader gets one
 * statement about their file rather than a project to reconcile.
 *
 * @param entries Prepared entries by template-local id. Resolution covers every entry
 *   or the apply does not start, so a missing one is a caller error rather than a
 *   property of the file
 * @param newBlockId Source of project-local block ids. Defaults to random UUIDs, the same
 *   ids `Project.addBlock` would have generated on its own; injectable so a test can name
 *   the ids it expects
 * @throws {TemplateEntryRejected} for the first entry the file describes unusably
 */
export function applyTemplateEntries(deps: {
  readonly document: ProjectTemplateV1;
  readonly placer: BlockPlacer;
  readonly projectHelper: ProjectHelper;
  readonly entries: ReadonlyMap<string, PreparedTemplateEntry>;
  readonly newBlockId?: () => string;
}): AppliedEntry[] {
  const { document, placer, projectHelper, entries } = deps;
  const newBlockId = deps.newBlockId ?? randomUUID;
  const added: AppliedEntry[] = [];

  /**
   * Template-local entry id → the block id it was given.
   *
   * An entry lands in here the moment it is given an id, before its block is placed. That is
   * safe precisely because the apply is all-or-nothing: there is no surviving project in
   * which a later entry could point at a block that never got created. It does mean an entry
   * whose params reference itself is wired to itself rather than left dangling — a document
   * the reference check rejects before an apply begins.
   */
  const blockIds = new Map<string, string>();

  for (const entry of document.blocks) {
    const prepared = entries.get(entry.id);
    if (prepared === undefined) {
      throw new TemplateEntryRejected(entry.id, `No block was prepared for entry '${entry.id}'.`);
    }

    const blockConfig = extractConfig(prepared.blockPack.config);

    // Only a block on the current storage facade can be told what to initialize itself
    // with, and it is refused rather than created with its own defaults even when the
    // entry carries no params: every entry names a kind, and a block predating the
    // facade implements none, so creating one would honour the entry's pinned version
    // while contradicting the kind it claims to be. With params it is worse still — a
    // block that looks applied but ignored everything the template said about it.
    //
    // Kind resolution never picks such a block, since declaring a kind requires a
    // recent SDK. An entry pinning an exact version can name anything ever published,
    // which is the way this is reached.
    if (blockConfig.modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) {
      throw new TemplateEntryRejected(
        entry.id,
        "This version of the block is too old to be created from a template. Use a " +
          "newer version of the block, or remove the pinned block version from this " +
          "entry so a supported one is chosen automatically.",
      );
    }

    const blockId = newBlockId();
    blockIds.set(entry.id, blockId);

    // Params are a mapping by the time a document exists — the parser reads an omitted key
    // as `{}` — so every entry goes through the params path and is checked against its kind.
    const live = resolveTemplateRefs(entry.params, blockIds);

    // The block's own model decides what params mean. Run before anything is
    // placed, so params it declines cost nothing but the report.
    const storage = projectHelper.getInitialStorageFromParamsInVM(blockConfig, live);
    if (storage.error !== undefined) {
      throw new TemplateEntryRejected(entry.id, storage.error.message);
    }

    placer.addBlock(
      { id: blockId, label: prepared.label, renderingMode: blockConfig.renderingMode },
      {
        storageMode: "fromModel",
        blockPack: prepared.blockPack,
        initialStorage: storage.value,
      },
    );

    added.push({ templateLocalId: entry.id, blockId });
  }

  return added;
}
