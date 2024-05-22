import {
  AnyRef,
  AnyResourceRef,
  field,
  PlTransaction,
  ResourceId,
  ResourceRef,
  ResourceType
} from '@milaboratory/pl-client-v2';
import { BlockPackSpec, createBlockPack } from './block_pack';
import { notEmpty } from './util';
import { createBool, KVAccessor } from './pl_util';
import { createBContextEnd, createRenderHeavyBlock } from './template_render';

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

export interface BlockInfo {
  readonly tplId: ResourceRef;
  readonly inputsToRender: ResourceRef;
  readonly blockId: ResourceRef;
}

export interface ProjectInfo {
  readonly rId: ResourceId;
  readonly structure: BlockStructure;
  readonly blocks: Map<string, BlockInfo>;
}

export class ProjectAccessor {
  private readonly blockStructure: KVAccessor<BlockStructure>;

  constructor(public readonly resourceId: ResourceId,
              private readonly tx: PlTransaction) {
    this.blockStructure = new KVAccessor(
      this.resourceId, BlockStructureKey, this.tx
    );
  }

  private blocks: Map<string, BlockAccessor> = new Map();

  // public

  private setSchemaVersion(version: number = SchemaVersionCurrent) {
    this.tx.setKValue(this.resourceId, SchemaVersionKey, version.toString());
  }

  public async getSchemaVersion(): Promise<number> {
    return Number(await this.tx.getKValue(this.resourceId, SchemaVersionKey));
  }

  public async addBlock(bpSpec: BlockPackSpec) {
    const uuid = crypto.randomUUID();
    const block = createBlock(this.tx, bpSpec);
  }
}

export class BlockAccessor {
  constructor(public readonly resourceId: ResourceId,
              private readonly tx: PlTransaction) {
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

export function renderProduction(tx: PlTransaction, prj: ProjectInfo): {
  result: AnyRef,
  context: AnyRef,
}[] {
  const order = prj.structure.blocks.map(b => b.id);
  const blocks = order.map(
    (id) => notEmpty(prj.blocks.get(id))
  );

  const results = [];

  const isProduction = createBool(tx, true);

  let ctx: AnyRef = createBContextEnd(tx);
  for (const b of blocks) {
    const rendered = createRenderHeavyBlock(
      tx, b.tplId, {
        args: b.inputsToRender,
        blockId: b.blockId,
        isProduction: isProduction,
        context: ctx
      }
    );

    ctx = notEmpty(rendered.context);
    results.push({
      result: notEmpty(rendered.result),
      context: ctx
    });
  }

  return results;
}
