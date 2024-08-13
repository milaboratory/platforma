import { ResourceId, ResourceType } from '@milaboratory/pl-client-v2';
import {
  ProjectListEntry as ProjectListEntryFromModel,
  ProjectMeta
} from '@milaboratory/pl-middle-layer-model';
import { BlockRenderingMode } from '@milaboratory/sdk-ui';

export interface ProjectListEntry extends ProjectListEntryFromModel {
  /** Project resource ID. */
  rid: ResourceId;
}

/** Entry representing a single block in block structure */
export interface Block {
  /** Unique block id */
  readonly id: string;

  /** Label shown to the user */
  label: string;

  /** How to approach block rendering */
  renderingMode: BlockRenderingMode;
}

/** Block group in block structure */
export interface BlockGroup {
  /** Unique group id */
  readonly id: string;

  /** Label shown to the user */
  label: string;

  /** Blocks */
  blocks: Block[];
}

/** Root of block structure value */
export interface ProjectStructure {
  /** The structure */
  readonly groups: BlockGroup[];
}

export const InitialBlockStructure: ProjectStructure = {
  groups: [{ id: 'default', label: 'Default', blocks: [] }]
};

/** Root of project rendering state */
export interface ProjectRenderingState {
  /** Timestamp of last staging rendering event */
  stagingRefreshTimestamp: number;

  /** Blocks with detached production state, i.e. some of the dependencies of
   * such blocks were re-rendered, but their state was left "as is". */
  blocksInLimbo: string[];
}

export const InitialProjectRenderingState: ProjectRenderingState = {
  stagingRefreshTimestamp: 0,
  blocksInLimbo: []
};

export const InitialBlockMeta: ProjectMeta = {
  label: 'New Project'
};

//
// Pl Model
//

export const ProjectResourceType: ResourceType = { name: 'UserProject', version: '2' };

export const SchemaVersionKey = 'SchemaVersion';
export const SchemaVersionCurrent = '1';

export const ProjectCreatedTimestamp = 'ProjectCreated';
export const ProjectLastModifiedTimestamp = 'ProjectLastModified';
export const ProjectMetaKey = 'ProjectMeta';
export const ProjectStructureKey = 'ProjectStructure';
export const BlockRenderingStateKey = 'BlockRenderingState';

export const BlockFrontendStateKeyPrefix = 'BlockFrontendState/';
export const BlockFrontendStateKeyPattern = /^BlockFrontendState\/(?<blockid>.*)$/;

export function blockFrontendStateKey(blockId: string): string {
  return `${BlockFrontendStateKeyPrefix}${blockId}`;
}

export const BlockArgsAuthorKeyPrefix = 'BlockArgsAuthor/';
export const BlockArgsAuthorKeyPattern = /^BlockArgsAuthor\/(?<blockid>.*)$/;

export function blockArgsAuthorKey(blockId: string): string {
  return `${BlockArgsAuthorKeyPrefix}${blockId}`;
}

export const ProjectStructureAuthorKey = 'ProjectStructureAuthor';

/** Returns block id, or undefined if key does not match the pattern. */
export function parseBlockFrontendStateKey(key: string): string | undefined {
  const match = key.match(BlockFrontendStateKeyPattern);
  if (match === null) return undefined;
  return match.groups!['blockid'];
}

export interface ProjectField {
  blockId: string;
  fieldName:
    | 'blockPack'
    | 'prodArgs'
    | 'currentArgs'
    | 'prodCtx'
    | 'prodOutput'
    | 'prodCtxPrevious'
    | 'prodOutputPrevious'
    | 'stagingCtx'
    | 'stagingOutput'
    | 'stagingCtxPrevious'
    | 'stagingOutputPrevious';
}

export function projectFieldName(blockId: string, fieldName: ProjectField['fieldName']): string {
  return `${blockId}-${fieldName}`;
}

const projectFieldPattern =
  /^(?<blockId>.*)-(?<fieldName>blockPack|prodArgs|currentArgs|prodCtx|prodOutput|prodCtxPrevious|prodOutputPrevious|stagingCtx|stagingOutput|stagingCtxPrevious|stagingOutputPrevious)$/;

export function parseProjectField(name: string): ProjectField | undefined {
  const match = name.match(projectFieldPattern);
  if (match === null) return undefined;
  const { blockId, fieldName } = match.groups!;
  return { blockId, fieldName } as ProjectField;
}
