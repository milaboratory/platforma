import {
  ResourceType,
  PlTransaction,
  ResourceId,
  AnyResourceRef,
  field
} from '@milaboratory/pl-ts-client-v2';
import { BlockPackSpec, createBlockPack } from './block_pack';

export const ProjectResourceType: ResourceType = { name: 'UserProject', version: '1' };
export const BlockResourceType: ResourceType = { name: 'UserProjectBlock', version: '1' };

export const Block: ResourceType = { name: 'Block', version: '2' };
export const BlockBlockPack = 'blockPack';

export const SchemaVersionKey = 'SchemaVersion';
export const SchemaVersionCurrent = 1;

export const BlockStructureKey = 'BlockStructure';

export interface Block {
  readonly id: string;
  name: string;
}

export interface BlockStructure {
  readonly blocks: Block[];
}

export const InitialBlockStructure: BlockStructure = {
  blocks: []
};

export class KVAccessor<T> {
  constructor(public readonly resourceId: ResourceId,
              public readonly key: string,
              private readonly tx: PlTransaction) {
  }

  private loaded?: Promise<void>;
  private _value?: T;
  private _changed: boolean = false;

  public ensureLoadingStarted() {
    if (this.loaded === undefined)
      this.loaded = (async () => {
        const data = await this.tx.getKValueString(this.resourceId, this.key);
        this._value = JSON.parse(data) as T;
      })();
  }

  public async getReadonly() {
    this.ensureLoadingStarted();
    await this.loaded!;
    return this._value;
  }

  public async getForChange() {
    this._changed = true;
    return await this.getReadonly();
  }

  public flush() {
    if (this.loaded === undefined
      || !this._value === undefined
      || !this._changed)
      return;
    this.tx.setKValue(this.resourceId, this.key, JSON.stringify(this._value));
    this._changed = false;
  }
}

export class ProjectAccessor {
  constructor(public readonly resourceId: ResourceId,
              private readonly tx: PlTransaction) {
  }

  private blockStructureLoaded?: Promise<void>;
  private blockStructure?: BlockStructure;

  public ensureBlockStructure() {
    if (this.blockStructureLoaded === undefined)
      this.blockStructureLoaded = (async () => {
        const data = await this.tx.getKValueString(this.resourceId, BlockStructureKey);
        this.blockStructure = JSON.parse(data) as BlockStructure;
      })();
  }

  public async getBlockStructure(): Promise<BlockStructure> {
    this.ensureBlockStructure();
    return await this.blockStructureLoaded!;
  }

  private setSchemaVersion(version: number = SchemaVersionCurrent) {
    this.tx.setKValue(this.resourceId, SchemaVersionKey, version.toString());
  }

  public async getSchemaVersion(): Promise<number> {
    return Number(await this.tx.getKValue(this.resourceId, SchemaVersionKey));
  }

  public async addBlock() {

  }
}

export function createProject(tx: PlTransaction): AnyResourceRef {
  const prj = tx.createEphemeral(ProjectResourceType);
  tx.lock(prj);
  tx.setKValue(prj, SchemaVersionKey, String(SchemaVersionCurrent));
  tx.setKValue(prj, BlockStructureKey, JSON.stringify(InitialBlockStructure));
  return prj;
}

export function createBlock(tx: PlTransaction,
                            bpSpec: BlockPackSpec): AnyResourceRef {
  const block = tx.createEphemeral(Block);
  tx.lock(block);
  const bp = createBlockPack(tx, bpSpec);
  const bpField = field(block, BlockBlockPack);
  tx.createField(bpField, 'Dynamic');
  tx.setField(bpField, bp);
  return block;
}
