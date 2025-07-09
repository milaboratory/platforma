import type { ResourceId, ResourceType } from '@milaboratories/pl-client';
import type {
  ProjectListEntry as ProjectListEntryFromModel,
  ProjectMeta,
} from '@milaboratories/pl-model-middle-layer';
import type { BlockRenderingMode } from '@platforma-sdk/model';

export interface ProjectListEntry extends ProjectListEntryFromModel {
  /** Project resource ID. */
  rid: ResourceId;
}

/** Entry representing a single block in block structure */
export interface Block {
  /** Unique block id */
  readonly id: string;

  /**
   * Label shown to the user
   * @deprecated
   * */
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
  groups: [{ id: 'default', label: 'Default', blocks: [] }],
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
  blocksInLimbo: [],
};

export const InitialBlockMeta: ProjectMeta = {
  label: 'New Project',
};

//
// Pl Model
//

export const ProjectResourceType: ResourceType = { name: 'UserProject', version: '2' };

export const SchemaVersionKey = 'SchemaVersion';
export const SchemaVersionCurrent = '2';

export const ProjectCreatedTimestamp = 'ProjectCreated';
export const ProjectLastModifiedTimestamp = 'ProjectLastModified';
export const ProjectMetaKey = 'ProjectMeta';
export const ProjectStructureKey = 'ProjectStructure';
export const BlockRenderingStateKey = 'BlockRenderingState';

export const BlockArgsAuthorKeyPrefix = 'BlockArgsAuthor/';
export const BlockArgsAuthorKeyPattern = /^BlockArgsAuthor\/(?<blockid>.*)$/;

export function blockArgsAuthorKey(blockId: string): string {
  return `${BlockArgsAuthorKeyPrefix}${blockId}`;
}

export const ProjectStructureAuthorKey = 'ProjectStructureAuthor';

export const ServiceTemplateCacheFieldPrefix = '__serviceTemplate_';

export function getServiceTemplateField(hash: string): string {
  return `${ServiceTemplateCacheFieldPrefix}${hash}`;
}

export interface ProjectField {
  blockId: string;
  fieldName:
    | 'blockPack'
    | 'blockSettings'
    | 'uiState'
    | 'prodArgs'
    | 'currentArgs'
    | 'prodCtx'
    | 'prodUiCtx'
    | 'prodOutput'
    | 'prodCtxPrevious'
    | 'prodUiCtxPrevious'
    | 'prodOutputPrevious'
    | 'stagingCtx'
    | 'stagingUiCtx'
    | 'stagingOutput'
    | 'stagingCtxPrevious'
    | 'stagingUiCtxPrevious'
    | 'stagingOutputPrevious';
}

export const FieldsToDuplicate: Set<ProjectField['fieldName']> = new Set([
  'blockPack',
  'blockSettings',
  'uiState',
  'prodArgs',
  'currentArgs',
  'prodCtx',
  'prodUiCtx',
  'prodOutput',
]);

export function projectFieldName(blockId: string, fieldName: ProjectField['fieldName']): string {
  return `${blockId}-${fieldName}`;
}

const projectFieldPattern
  = /^(?<blockId>.*)-(?<fieldName>blockPack|blockSettings|uiState|prodArgs|currentArgs|prodCtx|prodUiCtx|prodOutput|prodCtxPrevious|prodUiCtxPrevious|prodOutputPrevious|stagingCtx|stagingUiCtx|stagingOutput|stagingCtxPrevious|stagingUiCtxPrevious|stagingOutputPrevious)$/;

export function parseProjectField(name: string): ProjectField | undefined {
  const match = name.match(projectFieldPattern);
  if (match === null) return undefined;
  const { blockId, fieldName } = match.groups!;
  return { blockId, fieldName } as ProjectField;
}
