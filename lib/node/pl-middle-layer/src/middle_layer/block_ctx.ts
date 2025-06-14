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

export type BlockContextMaterialized = {
  readonly blockId: string;
  readonly args: string;
  readonly uiState?: string;
};

export type BlockContextArgsOnly = {
  readonly blockId: string;
  readonly args: (cCtx: ComputableCtx) => string;
  readonly activeArgs: (cCtx: ComputableCtx) => string | undefined;
  readonly uiState: (cCtx: ComputableCtx) => string | undefined;
  readonly blockMeta: (cCtx: ComputableCtx) => Map<string, Block>;
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
  const uiState = (cCtx: ComputableCtx) => {
    const data = cCtx
      .accessor(projectEntry)
      .node()
      .traverse({
        field: projectFieldName(blockId, 'uiState'),
        stableIfNotFound: true,
      })
      ?.getData();
    return data ? cachedDecode(data) : undefined;
  };
  return {
    blockId,
    args,
    activeArgs,
    uiState,
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
      const result = cCtx
        .accessor(projectEntry)
        .node({ ignoreError: true })
        .traverse({
          field: projectFieldName(blockId, 'stagingOutput'),
          ignoreError: true,
        })
        ?.persist();
      if (result === undefined) cCtx.markUnstable('staging_not_rendered');
      return result;
    },
    getResultsPool: (cCtx: ComputableCtx) => ResultPool.create(cCtx, projectEntry, blockId),
  };
}
