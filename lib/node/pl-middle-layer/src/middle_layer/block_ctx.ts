import { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import { blockFrontendStateKey, projectFieldName } from '../model/project_model';
import { ComputableCtx } from '@milaboratory/computable';
import { notEmpty } from '@milaboratory/ts-helpers';
import { Optional } from 'utility-types';
import { ResultPool } from '../pool/result_pool';

export type BlockContextArgsOnly = {
  readonly blockId: string;
  readonly args: string;
  readonly uiState: string | undefined;
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
  const args = notEmpty(
    projectNode
      .traverse({
        field: projectFieldName(blockId, 'currentArgs'),
        errorIfFieldNotAssigned: true
      })
      .getDataAsString()
  );
  const uiState = projectNode.getKeyValueAsString(blockFrontendStateKey(blockId));
  return { blockId, args, uiState };
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
