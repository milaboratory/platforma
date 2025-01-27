import { ComputableCtx } from '@milaboratories/computable';
import { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import { notEmpty } from '@milaboratories/ts-helpers';
import { Optional } from 'utility-types';
import {
  Block,
  ProjectStructure,
  ProjectStructureKey,
  blockFrontendStateKey,
  projectFieldName
} from '../model/project_model';
import { allBlocks } from '../model/project_model_util';
import { ResultPool } from '../pool/result_pool';

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
  blockId: string
): BlockContextArgsOnly {
  const args = (cCtx: ComputableCtx) =>
    notEmpty(
      cCtx
        .accessor(projectEntry)
        .node()
        .traverse({
          field: projectFieldName(blockId, 'currentArgs'),
          errorIfFieldNotSet: true
        })
        .getDataAsString()
    );
  const activeArgs = (cCtx: ComputableCtx) =>
    cCtx
      .accessor(projectEntry)
      .node()
      .traverse({
        field: projectFieldName(blockId, 'prodArgs'),
        stableIfNotFound: true
      })
      ?.getDataAsString();
  const uiState = (cCtx: ComputableCtx) =>
    cCtx.accessor(projectEntry).node().getKeyValueAsString(blockFrontendStateKey(blockId));
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
    }
  };
}

export function constructBlockContext(
  projectEntry: PlTreeEntry,
  blockId: string
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
          ignoreError: true
        })
        ?.persist();
    },
    staging: (cCtx: ComputableCtx) => {
      const result = cCtx
        .accessor(projectEntry)
        .node({ ignoreError: true })
        .traverse({
          field: projectFieldName(blockId, 'stagingOutput'),
          ignoreError: true
        })
        ?.persist();
      if (result === undefined) cCtx.markUnstable('staging_not_rendered');
      return result;
    },
    getResultsPool: (cCtx: ComputableCtx) => ResultPool.create(cCtx, projectEntry, blockId)
  };
}
