import { ResourceType } from '@milaboratory/pl-client-v2';

/** Structure to help resolve conflicts if multiple participants writes to the same state */
export interface AuthorMarker {
  /** Unique identifier of client or even a specific window that set this particular state */
  authorId: string;
  /** Sequential version of the state local to the author */
  localVersion: number;
}

export type BlockRenderingMode =
  | 'Light'
  | 'Heavy'
  | 'DualContextHeavy';

/** Entry representing single block in block structure */
export interface Block {
  /** Unique block id */
  readonly id: string;

  name: string;

  renderingMode: BlockRenderingMode;
}

/** Block group in block structure */
export interface BlockGroup {
  readonly id: string;
  name: string;
  blocks: Block[];
}

/** Root of block structure value */
export interface ProjectStructure {
  readonly authorMarker?: AuthorMarker;
  readonly groups: BlockGroup[];
}

export const InitialBlockStructure: ProjectStructure = {
  groups: [{ id: 'default', name: 'Default', blocks: [] }]
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


//
// Pl Model
//

export const ProjectResourceType: ResourceType = { name: 'UserProject', version: '2' };

export const SchemaVersionKey = 'SchemaVersion';
export const SchemaVersionCurrent = '1';

export const BlockStructureKey = 'BlockStructure';
export const BlockRenderingStateKey = 'BlockRenderingState';

export interface ProjectField {
  blockId: string;
  fieldName:
    | 'blockPack'
    | 'prodInputs' | 'currentInputs'
    | 'prodCtx' | 'prodOutput'
    | 'prodCtxPrevious' | 'prodOutputPrevious'
    | 'stagingCtx' | 'stagingOutput'
    | 'stagingCtxPrevious' | 'stagingOutputPrevious';
}

export function projectFieldName(field: ProjectField) {
  return `${field.blockId}-${field.fieldName}`;
}

const projectFieldPattern = /^(?<blockId>.*)-(?<fieldName>blockPack|prodInputs|currentInputs|prodCtx|prodOutput|prodCtxPrevious|prodOutputPrevious|stagingCtx|stagingOutput|stagingCtxPrevious|stagingOutputPrevious)$/;

export function parseProjectField(name: string): ProjectField | undefined {
  const match = name.match(projectFieldPattern);
  if (match === null)
    return undefined;
  const { blockId, fieldName } = match.groups!;
  return { blockId, fieldName } as ProjectField;
}
