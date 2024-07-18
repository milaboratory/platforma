import { ProjectMeta } from './project';
import { BlockPackSpec } from './block_pack';
import {
  BlockRenderingMode,
  BlockSection,
  NavigationState
} from '@milaboratory/sdk-model';

/** Generalized block status, to be used in block item "styling". */
export type BlockCalculationStatus =
  | 'NotCalculated'
  | 'Running'
  | 'Done'
  | 'Limbo';

/** Overview of the whole project state, required to render a left panel. */
export type ProjectOverview = {
  /** Metadata, like project label associated with the project */
  meta: ProjectMeta;

  /** Creation timestamp. */
  created: Date;

  /** Last modification timestamp. */
  lastModified: Date;

  /** Overview information for each block */
  blocks: BlockStateOverview[];
};

/** Overview of the block state, required for visualization in the left panel */
export type BlockStateOverview = {
  /** Block id */
  id: string;

  /** Blocks label visible to the user */
  label: string;

  /** Block rendering mode */
  renderingMode: BlockRenderingMode;

  /**
   * True if block have missing references, e.g. referenced block was deleted
   * or moved downstream.
   * */
  missingReference: boolean;

  /**
   * Means that current heavy results (or results being calculated at the
   * moment) are not in sync with current arguments. This takes into account
   * stale state of all upstream blocks as well. Initial state also considered
   * stale.
   * */
  stale: boolean;

  /**
   * True if any of the outputs have errors. Errors may appear even before
   * calculations are finished.
   * */
  outputErrors: boolean;

  /** Generalized block calculation status */
  calculationStatus: BlockCalculationStatus;

  /**
   * All upstream blocks of this block. In other words all dependencies of this
   * block, including transitive dependencies.
   * */
  upstreams: string[];

  /**
   * All downstream blocks of this block. In other words all blocks that depends
   * on outputs of this block, accounting for transitive dependencies.
   * */
  downstreams: string[];

  /**
   * Block sections. May be unavailable, if block-pack for this block is not
   * yet materialized.
   * */
  sections: BlockSection[] | undefined;

  /**
   * True if inputs of current block are suitable for block execution.
   * May be unavailable, if block-pack for this block is not yet materialized.
   * */
  inputsValid: boolean | undefined;

  /**
   * True if current block can be executed. This takes into account can run of
   * all upstream blocks as well.
   * */
  canRun: boolean;

  /** Information on where the block pack for this block came from */
  currentBlockPack: BlockPackSpec | undefined;

  /**
   * If block pack update is available this field will contain latest specs to
   * perform the update
   * */
  updatedBlockPack: BlockPackSpec | undefined;

  /** Current navigation state of the block */
  navigationState: NavigationState;
};
