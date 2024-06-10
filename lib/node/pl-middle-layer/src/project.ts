import { ResourceId } from '@milaboratory/pl-client-v2';
import { Computable, ComputableStableDefined } from '@milaboratory/computable';
import { ProjectOverview } from './middle_layer/project_overview';
import { BlockPackSpecAny } from './model/block_pack_spec';
import { AuthorMarker } from './model/project_model';
import { FullBlockState } from './middle_layer/block';
import { randomUUID } from 'node:crypto';

/** Data access object, to manipulate and read single opened (!) project data. */
export interface Project {
  /** Underlying pl resource id */
  readonly rid: ResourceId;

  /** Data for the left panel, contain basic information about block status. */
  readonly overview: ComputableStableDefined<ProjectOverview>;

  /** Adds new block to the project.
   *
   * @param blockLabel
   * @param blockPackSpec
   * @param blockId
   * @param blockId
   * */
  addBlock(blockLabel: string, blockPackSpec: BlockPackSpecAny,
           blockId?: string, after?: string): Promise<string>;

  setBlockArgs(blockId: string, args: any, author?: AuthorMarker): Promise<void>;

  runBlock(blockId: string): Promise<void>;

  getBlockState(blockId: string): Computable<FullBlockState>;

  getBlockFrontend(blockId: string): ComputableStableDefined<string>;

  destroy(): void;

  setUiState(blockId: string, uiState: any, author?: AuthorMarker): Promise<void>;

  setBlockArgsAndUiState(blockId: string, args: any, uiState: any, author?: AuthorMarker): Promise<void>;
}
