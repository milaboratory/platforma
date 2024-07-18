import { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import {
  Block,
  ProjectStructure,
  ProjectStructureKey,
  blockFrontendStateKey,
  projectFieldName
} from '../model/project_model';
import { ComputableCtx } from '@milaboratory/computable';
import { notEmpty } from '@milaboratory/ts-helpers';
import { Optional } from 'utility-types';
import { ResultPool } from '../pool/result_pool';
import { allBlocks } from '../model/project_model_util';

export type BlockContextArgsOnly = {
  readonly blockId: string;
  readonly args: string;
  readonly uiState: string | undefined;
  readonly blockMeta: (cCtx: ComputableCtx) => Map<string, Block>;
};

export type BlockContextFull = BlockContextArgsOnly & {
  readonly prod: (cCtx: ComputableCtx) => PlTreeEntry | undefined;
  readonly staging: (cCtx: ComputableCtx) => PlTreeEntry | undefined;
  readonly getResultsPool: (cCtx: ComputableCtx) => ResultPool;
};

export type BlockContextAny = Optional<BlockContextFull, 'prod' | 'staging' | 'getResultsPool'>;

export function constructBlockContextArgsOnly(
  projectNode: PlTreeNodeAccessor,
  blockId: string
): BlockContextArgsOnly {
  const projectEntry = projectNode.persist();
  const args = notEmpty(
    projectNode
      .traverse({
        field: projectFieldName(blockId, 'currentArgs'),
        errorIfFieldNotSet: true
      })
      .getDataAsString()
  );
  const uiState = projectNode.getKeyValueAsString(blockFrontendStateKey(blockId));
  return {
    blockId,
    args,
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
  projectNode: PlTreeNodeAccessor,
  blockId: string
): BlockContextFull {
  const projectEntry = projectNode.persist();
  return {
    ...constructBlockContextArgsOnly(projectNode, blockId),
    prod: (cCtx: ComputableCtx) => {
      return cCtx
        .accessor(projectEntry)
        .node()
        .traverse({
          field: projectFieldName(blockId, 'prodOutput'),
          stableIfNotFound: true,
          ignoreError: true
        })
        ?.persist();
    },
    staging: (cCtx: ComputableCtx) => {
      return cCtx
        .accessor(projectEntry)
        .node()
        .traverse({
          field: projectFieldName(blockId, 'stagingOutput'),
          ignoreError: true
        })
        ?.persist();
    },
    getResultsPool: (cCtx: ComputableCtx) => ResultPool.create(cCtx, projectEntry, blockId)
  };
}
