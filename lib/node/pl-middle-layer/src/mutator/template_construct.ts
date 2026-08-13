import { BLOCK_STORAGE_FACADE_VERSION, extractConfig } from "@platforma-sdk/model";
import type { ProjectTemplateV1 } from "@milaboratories/pl-model-common";
import type { BlockPackSpecPrepared } from "../model";
import type { ProjectHelper } from "../model/project_helper";
import type { AppliedEntry, TemplateApplyOutcome } from "../model/template_apply";
import type { TemplateIdMap } from "../model/template_ids";
import { createTemplateIdMap } from "../model/template_ids";
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
 * **Stops at the first entry it cannot create.** Continuing would place blocks whose
 * upstream is missing, so the surviving project would be wired to nothing in the middle —
 * worse than a project that is short a tail. The blocks already added are kept and reported:
 * they are valid and the user can finish by hand, and deleting them would also destroy the
 * only evidence of how far the apply got.
 *
 * **What is reported and what is thrown.** Params a block declines are reported — they are
 * statements about the file, and the entries already placed stay placed. A failure to
 * *place* a block is not caught: by then the mutator holds half a change, and committing
 * that would persist something no one wrote. So it propagates and takes the transaction with
 * it, and the project ends up as it was before the apply.
 *
 * @param entries Prepared entries by template-local id. Resolution covers every entry
 *   or the apply does not start, so a missing one is a caller error rather than a
 *   property of the file
 * @param ids Defaults to a fresh map, which is what an apply wants; injectable so a test
 *   can name the ids it expects
 */
export function applyTemplateEntries(deps: {
  readonly document: ProjectTemplateV1;
  readonly placer: BlockPlacer;
  readonly projectHelper: ProjectHelper;
  readonly entries: ReadonlyMap<string, PreparedTemplateEntry>;
  readonly ids?: TemplateIdMap;
}): TemplateApplyOutcome {
  const { document, placer, projectHelper, entries } = deps;
  const ids = deps.ids ?? createTemplateIdMap();
  const added: AppliedEntry[] = [];

  const stop = (entryId: string, error: string): TemplateApplyOutcome => ({
    added,
    problem: { entryId, error },
  });

  for (const entry of document.blocks) {
    const prepared = entries.get(entry.id);
    if (prepared === undefined) {
      return stop(entry.id, `No block was prepared for entry '${entry.id}'.`);
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
      return stop(
        entry.id,
        "This version of the block is too old to be created from a template. Use a " +
          "newer version of the block, or remove the pinned block version from this " +
          "entry so a supported one is chosen automatically.",
      );
    }

    const blockId = ids.assign(entry.id);

    // An entry that omits `params` is read as `{}`, not routed around the params path.
    // The two produce the same block — both reach the same init factory and both
    // assemble storage the same way — but only this one is checked against the kind, so
    // an omitted key can no longer be a way to apply an entry the contract rejects.
    const live = ids.liveParams(entry.params ?? {});
    if (!live.ok) return stop(entry.id, live.error);

    // The block's own model decides what params mean. Run before anything is
    // placed, so params it declines cost nothing but the report.
    const storage = projectHelper.getInitialStorageFromParamsInVM(blockConfig, live.params);
    if (storage.error !== undefined) return stop(entry.id, storage.error.message);

    placer.addBlock(
      { id: blockId, label: prepared.label, renderingMode: blockConfig.renderingMode },
      {
        storageMode: "fromModel",
        blockPack: prepared.blockPack,
        initialStorage: storage.value,
      },
    );

    // Only now is the entry a redirect target: an entry that failed must not become one,
    // and its own params must not resolve to the block being created from them.
    ids.record(entry.id, blockId);
    added.push({ templateLocalId: entry.id, blockId });
  }

  return { added };
}
