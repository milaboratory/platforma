import { ResourceId } from '@milaboratory/pl-client-v2';
import { AuthorMarker, BlockRenderingMode, ProjectMeta } from '../model/project_model';
import { Section } from '@milaboratory/sdk-block-config';
import { BlockPackSource } from '../model/block_pack_spec';

//
// Project List
//

/** Represents single entry in the list of projects owned by current user */
export interface ProjectListEntry {
  /** Project resource ID. */
  rid: ResourceId,
  /** Internal (user-specific) project id */
  id: string,
  /** True if project is opened */
  opened: boolean,
  /** Project meta, namely label */
  meta: ProjectMeta
}

export type ProjectList = ProjectListEntry[];

//
// Project Overview
//

/** Generalized block status, to be used in block item "styling". */
export type BlockProductionStatus =
  | 'NotCalculated'
  | 'Running'
  | 'Error'
  | 'Done'
  | 'Limbo'

/** Overview of the whole project state, required to render a left panel. */
export type ProjectOverview = {
  /** Metadata, like project label associated with the project */
  meta: ProjectMeta;

  /** Overview information for each block */
  blocks: BlockState[];
}

/** Overview of the block state, required for visualization in the left panel */
export type BlockState = {
  /** Block id */
  id: string,

  /** Blocks label visible to the user */
  label: string,

  /** Block rendering mode */
  renderingMode: BlockRenderingMode,

  /** True if block have missing references, e.g. referenced block was deleted
   * or moved downstream. */
  missingReference: boolean;

  /** Means that current heavy results (or results being calculated at the
   * moment) are not in sync with current arguments. This takes into account
   * stale state of all upstream blocks as well.*/
  stale: boolean;

  /** Generalized block calculation status */
  calculationStatus: BlockProductionStatus;

  /** Block sections. May be unavailable, if block-pack for this block is not
   * yet materialized. */
  sections: Section[] | undefined,

  /** True if current block can be executed in terms of
   * {@link Project.runBlock} method. */
  canRun: boolean | undefined,

  /** Information on where the block pack for this block came from */
  blockPackSource: BlockPackSource | undefined
}

type CalculationStatus =
  | 'Running'
  | 'Error'
  | 'Done'

export type ProdState = {

  calculationStatus: CalculationStatus


  stale: boolean

  /** Arguments current production was rendered with. */
  arguments: any
}

//
// Block State
//

export interface FullBlockState {
  /** Author marker for Args and UI state. Absence of author marker, means that
   * last modifier of the state provided no author marker. */
  author?: AuthorMarker;

  /** Block arguments */
  args: any;

  /** Ui State, i.e. any block state that must be persisted but is not passed
   * to the backend template. */
  ui: any;

  /** Outputs, rendered with block-specified config. */
  outputs: any | undefined;

  /** Information on where the block pack for this block came from */
  blockPackSource: BlockPackSource | undefined;
}
