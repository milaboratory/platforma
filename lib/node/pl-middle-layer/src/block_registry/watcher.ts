import { PollComputablePool, PollPoolOps } from '@milaboratory/computable';
import { BlockPackSpec } from '@milaboratory/pl-middle-layer-model';
import { Dispatcher } from 'undici';
import { getDevV1PacketMtime, getDevV2PacketMtime } from './registry';
import { tryLoadPackDescriptionFromSource } from '@milaboratory/pl-block-tools';

export const DefaultBlockUpdateWatcherOps: PollPoolOps = {
  minDelay: 1500
};

export type BlockUpdateWatcherOps = Partial<PollPoolOps> & { readonly http?: Dispatcher };

const NoUpdatesKey = '__no_updates__';

export class BlockUpdateWatcher extends PollComputablePool<
  BlockPackSpec,
  BlockPackSpec | undefined
> {
  private readonly http?: Dispatcher;

  constructor(ops: BlockUpdateWatcherOps = {}) {
    super({ ...ops, ...DefaultBlockUpdateWatcherOps });
    this.http = ops.http;
  }

  protected getKey(req: BlockPackSpec): string {
    switch (req.type) {
      case 'dev':
      case 'dev-v1':
        return `dev_1_${req.folder}_${req.mtime}`;
      case 'dev-v2':
        return `dev_2_${req.folder}_${req.mtime}`;
      default:
        return NoUpdatesKey;
    }
  }

  protected async readValue(req: BlockPackSpec): Promise<BlockPackSpec | undefined> {
    switch (req.type) {
      case 'dev':
      case 'dev-v1': {
        const mtime = await getDevV1PacketMtime(req.folder);
        if (mtime === req.mtime) return undefined;
        else return { ...req, mtime };
      }
      case 'dev-v2': {
        const description = await tryLoadPackDescriptionFromSource(req.folder);
        if (description === undefined) return undefined;
        const mtime = await getDevV2PacketMtime(description);
        if (mtime === req.mtime) return undefined;
        else return { ...req, mtime: mtime };
      }
      default:
        return undefined;
    }
  }

  protected resultsEqual(
    res1: BlockPackSpec | undefined,
    res2: BlockPackSpec | undefined
  ): boolean {
    if (res1 === undefined && res2 === undefined) return true;
    if (res1 === undefined || res2 === undefined) return false;
    if (res1.type === 'from-registry-v1' || res2.type === 'from-registry-v1')
      throw new Error('Unexpected, not yet supported.');
    return res1.folder === res2.folder && res1.mtime === res2.mtime;
  }
}
