import type { ComputableCtx } from "@milaboratories/computable";
import type { PlTreeEntry } from "@milaboratories/pl-tree";
import { cachedDecode, notEmpty } from "@milaboratories/ts-helpers";
import type { Optional } from "utility-types";
import type { Block, ProjectStructure } from "../model/project_model";
import { ProjectStructureKey, projectFieldName } from "../model/project_model";
import { allBlocks } from "../model/project_model_util";
import { ResultPool } from "../pool/result_pool";
import { deriveDataFromStorage, type JsRenderInternal } from "@platforma-sdk/model";
import { readArgsField } from "../model/args_fields";

export type BlockContextArgsOnly = {
  readonly blockId: string;
  readonly args: (cCtx: ComputableCtx) => string | undefined;
  readonly activeArgs: (cCtx: ComputableCtx) => string | undefined;
  readonly blockMeta: (cCtx: ComputableCtx) => Map<string, Block>;
  readonly data: (cCtx: ComputableCtx) => string | undefined;
  readonly blockStorage: (cCtx: ComputableCtx) => string | undefined;
  readonly prerunArgs: (cCtx: ComputableCtx) => string | undefined;
  /**
   * Args of the block other than `args` and `activeArgs`, by name, as a JSON string; `undefined`
   * when the block has none of them. A draft is given only while the block has no ready args of
   * its kind and holds the storage the draft was derived from.
   */
  readonly argsField: (
    cCtx: ComputableCtx,
    name: JsRenderInternal.ArgsFieldName,
  ) => string | undefined;
};

export type BlockContextFull = BlockContextArgsOnly & {
  readonly prod: (cCtx: ComputableCtx) => PlTreeEntry | undefined;
  readonly staging: (cCtx: ComputableCtx) => PlTreeEntry | undefined;
  readonly getResultsPool: (cCtx: ComputableCtx) => ResultPool;
  readonly projectEntry: PlTreeEntry;
};

export type BlockContextAny = Optional<
  BlockContextFull,
  "prod" | "staging" | "getResultsPool" | "projectEntry"
>;

export function constructBlockContextArgsOnly(
  projectEntry: PlTreeEntry,
  blockId: string,
): BlockContextArgsOnly {
  const args = (cCtx: ComputableCtx) => {
    const data = cCtx
      .accessor(projectEntry)
      .node()
      .traverse({
        field: projectFieldName(blockId, "currentArgs"),
        stableIfNotFound: true,
      })
      ?.getData();
    return data ? cachedDecode(data) : undefined;
  };
  const activeArgs = (cCtx: ComputableCtx) => {
    const data = cCtx
      .accessor(projectEntry)
      .node()
      .traverse({
        field: projectFieldName(blockId, "prodArgs"),
        stableIfNotFound: true,
      })
      ?.getData();
    return data ? cachedDecode(data) : undefined;
  };
  const data = (cCtx: ComputableCtx) => {
    const data = cCtx
      .accessor(projectEntry)
      .node()
      .traverse({
        field: projectFieldName(blockId, "blockStorage"),
        stableIfNotFound: true,
      })
      ?.getData();
    if (!data) return undefined;

    const rawJson = cachedDecode(data);
    if (!rawJson) return undefined;

    // Parse to check if it's BlockStorage format
    try {
      const parsed = JSON.parse(rawJson);
      return JSON.stringify(deriveDataFromStorage(parsed));
    } catch (err) {
      console.error("Error deriving data from storage", err);
      return undefined;
    }
  };
  // Returns raw blockStorage JSON - UI derives data using sdk/model
  const blockStorage = (cCtx: ComputableCtx) => {
    const storageData = cCtx
      .accessor(projectEntry)
      .node()
      .traverse({
        field: projectFieldName(blockId, "blockStorage"),
        stableIfNotFound: true,
      })
      ?.getData();
    if (!storageData) return undefined;
    return cachedDecode(storageData);
  };
  const prerunArgs = (cCtx: ComputableCtx) => {
    const data = cCtx
      .accessor(projectEntry)
      .node()
      .traverse({
        field: projectFieldName(blockId, "currentPrerunArgs"),
        stableIfNotFound: true,
      })
      ?.getData();
    return data ? cachedDecode(data) : undefined;
  };
  const argsField = (cCtx: ComputableCtx, name: JsRenderInternal.ArgsFieldName) => {
    const data = readArgsField(cCtx.accessor(projectEntry).node(), blockId, name)?.getData();
    return data ? cachedDecode(data) : undefined;
  };
  return {
    blockId,
    args,
    activeArgs,
    data,
    blockStorage,
    prerunArgs,
    argsField,
    blockMeta: (cCtx: ComputableCtx) => {
      const prj = cCtx.accessor(projectEntry).node();
      const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
      const result = new Map<string, Block>();
      for (const block of allBlocks(structure)) result.set(block.id, block);
      return result;
    },
  };
}

export function constructBlockContext(
  projectEntry: PlTreeEntry,
  blockId: string,
): BlockContextFull {
  return {
    ...constructBlockContextArgsOnly(projectEntry, blockId),
    prod: (cCtx: ComputableCtx) => {
      return cCtx
        .accessor(projectEntry)
        .node({ ignoreError: true })
        .traverse({
          field: projectFieldName(blockId, "prodOutput"),
          stableIfNotFound: true,
          ignoreError: true,
        })
        ?.persist();
    },
    staging: (cCtx: ComputableCtx) => {
      // Check if staging is expected (currentPrerunArgs is set)
      // For blocks with failed args derivation, staging will never be rendered
      const hasPrerunArgs =
        cCtx
          .accessor(projectEntry)
          .node({ ignoreError: true })
          .traverse({
            field: projectFieldName(blockId, "currentPrerunArgs"),
            stableIfNotFound: true,
            ignoreError: true,
          }) !== undefined;

      const result = cCtx
        .accessor(projectEntry)
        .node({ ignoreError: true })
        .traverse({
          field: projectFieldName(blockId, "stagingOutput"),
          // Only mark stable if staging is NOT expected (no prerunArgs)
          stableIfNotFound: !hasPrerunArgs,
          ignoreError: true,
        })
        ?.persist();
      return result;
    },
    getResultsPool: (cCtx: ComputableCtx) => ResultPool.create(cCtx, projectEntry, blockId),
    projectEntry,
  };
}
