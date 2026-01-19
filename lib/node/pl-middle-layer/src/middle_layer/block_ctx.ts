import type { ComputableCtx } from '@milaboratories/computable';
import type { PlTreeEntry } from '@milaboratories/pl-tree';
import { cachedDecode, notEmpty } from '@milaboratories/ts-helpers';
import type { Optional } from 'utility-types';
import type {
  Block,
  ProjectStructure } from '../model/project_model';
import {
  ProjectStructureKey,
  projectFieldName,
} from '../model/project_model';
import { allBlocks } from '../model/project_model_util';
import { ResultPool } from '../pool/result_pool';
import { isBlockStorage, getStorageData } from '@platforma-sdk/model';

export type BlockContextArgsOnly = {
  readonly blockId: string;
  readonly args: (cCtx: ComputableCtx) => string;
  readonly activeArgs: (cCtx: ComputableCtx) => string | undefined;
  readonly blockMeta: (cCtx: ComputableCtx) => Map<string, Block>;
  readonly data: (cCtx: ComputableCtx) => string | undefined;
  readonly preRunArgs: (cCtx: ComputableCtx) => string | undefined;
};

export type BlockContextFull = BlockContextArgsOnly & {
  readonly prod: (cCtx: ComputableCtx) => PlTreeEntry | undefined;
  readonly staging: (cCtx: ComputableCtx) => PlTreeEntry | undefined;
  readonly getResultsPool: (cCtx: ComputableCtx) => ResultPool;
};

export type BlockContextAny = Optional<BlockContextFull, 'prod' | 'staging' | 'getResultsPool'>;

export function constructBlockContextArgsOnly(
  projectEntry: PlTreeEntry,
  blockId: string,
): BlockContextArgsOnly {
  const args = (cCtx: ComputableCtx) =>
    cachedDecode(notEmpty(
      cCtx
        .accessor(projectEntry)
        .node()
        .traverse({
          field: projectFieldName(blockId, 'currentArgs'),
          errorIfFieldNotSet: true,
        })
        .getData(),
    ));
  const activeArgs = (cCtx: ComputableCtx) => {
    const data = cCtx
      .accessor(projectEntry)
      .node()
      .traverse({
        field: projectFieldName(blockId, 'prodArgs'),
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
        field: projectFieldName(blockId, 'blockStorage'),
        stableIfNotFound: true,
      })
      ?.getData();
    if (!data) return undefined;

    const rawJson = cachedDecode(data);
    if (!rawJson) return undefined;

    // Parse to check if it's BlockStorage format
    try {
      const parsed = JSON.parse(rawJson);
      if (isBlockStorage(parsed)) {
        // Extract data from BlockStorage format
        return JSON.stringify(getStorageData(parsed));
      }
    } catch {
      // If parsing fails, return raw
    }

    // Return raw for legacy format
    return rawJson;
  };
  const preRunArgs = (cCtx: ComputableCtx) => {
    const data = cCtx
      .accessor(projectEntry)
      .node()
      .traverse({
        field: projectFieldName(blockId, 'currentPreRunArgs'),
        stableIfNotFound: true,
      })
      ?.getData();
    return data ? cachedDecode(data) : undefined;
  };
  return {
    blockId,
    args,
    activeArgs,
    data,
    preRunArgs,
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
          field: projectFieldName(blockId, 'prodOutput'),
          stableIfNotFound: true,
          ignoreError: true,
        })
        ?.persist();
    },
    staging: (cCtx: ComputableCtx) => {
      // Check if staging is expected (currentPreRunArgs is set)
      // For blocks with failed args derivation, staging will never be rendered
      const hasPreRunArgs = cCtx
        .accessor(projectEntry)
        .node({ ignoreError: true })
        .traverse({
          field: projectFieldName(blockId, 'currentPreRunArgs'),
          stableIfNotFound: true,
          ignoreError: true,
        }) !== undefined;

      const result = cCtx
        .accessor(projectEntry)
        .node({ ignoreError: true })
        .traverse({
          field: projectFieldName(blockId, 'stagingOutput'),
          // Only mark stable if staging is NOT expected (no preRunArgs)
          stableIfNotFound: !hasPreRunArgs,
          ignoreError: true,
        })
        ?.persist();
      return result;
    },
    getResultsPool: (cCtx: ComputableCtx) => ResultPool.create(cCtx, projectEntry, blockId),
  };
}
