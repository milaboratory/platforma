import { PollComputablePool, PollPoolOps } from '@milaboratories/computable';
import {
  AnyChannel,
  BlockPackFromRegistryV2,
  blockPackIdEquals,
  blockPackIdToString,
  BlockPackSpec,
  StableChannel
} from '@milaboratories/pl-model-middle-layer';
import { Dispatcher } from 'undici';
import { getDevV1PacketMtime, getDevV2PacketMtime } from './registry';
import { tryLoadPackDescription } from '@platforma-sdk/block-tools';
import { assertNever, MiLogger } from '@milaboratories/ts-helpers';
import { V2RegistryProvider } from './registry-v2-provider';
import semver from 'semver';

export const DefaultBlockUpdateWatcherOps: PollPoolOps = {
  minDelay: 1500
};

export type BlockUpdateWatcherOps = Partial<PollPoolOps> & {
  readonly http?: Dispatcher;
  readonly preferredUpdateChannel?: string;
};

const NoUpdatesKey = '__no_updates__';

export class BlockUpdateWatcher extends PollComputablePool<
  BlockPackSpec,
  BlockPackSpec | undefined
> {
  private readonly http?: Dispatcher;
  private readonly preferredUpdateChannel?: string;

  constructor(
    private readonly registryProvider: V2RegistryProvider,
    logger: MiLogger,
    ops: BlockUpdateWatcherOps = {}
  ) {
    super({ ...ops, ...DefaultBlockUpdateWatcherOps }, logger);
    this.http = ops.http;
    this.preferredUpdateChannel = ops.preferredUpdateChannel;
  }

  protected getKey(req: BlockPackSpec): string {
    switch (req.type) {
      case 'dev-v1':
        return `dev_1_${req.folder}_${req.mtime}`;
      case 'dev-v2':
        return `dev_2_${req.folder}_${req.mtime}`;
      case 'from-registry-v2':
        return `from_registry_v2_${req.registryUrl}_${req.id.organization}_${req.id.name}_${req.id.version}`;
      default:
        return NoUpdatesKey;
    }
  }

  protected async readValue(req: BlockPackSpec): Promise<BlockPackSpec | undefined> {
    try {
      switch (req.type) {
        case 'dev-v1': {
          try {
            const mtime = await getDevV1PacketMtime(req.folder);
            if (mtime === req.mtime) return undefined;
            else return { ...req, mtime };
          } catch (err: unknown) {
            this.logger.warn(err);
            return undefined;
          }
        }

        case 'dev-v2': {
          try {
            const description = await tryLoadPackDescription(req.folder, this.logger);
            if (description === undefined) return undefined;
            const mtime = await getDevV2PacketMtime(description);
            if (mtime === req.mtime) return undefined;
            else return { ...req, mtime: mtime };
          } catch (err: unknown) {
            this.logger.warn(err);
            return undefined;
          }
        }

        case 'from-registry-v2': {
          try {
            const registry = this.registryProvider.getRegistry(req.registryUrl);
            let spec: BlockPackSpec | undefined;

            if (req.channel === undefined) {
              const a1 = await registry.getLatestOverview(req.id, StableChannel);
              if (a1) spec = a1.spec;
              else {
                // forcing update from non-existent channel to stable
                const a2 = await registry.getLatestOverview(req.id, AnyChannel);
                if (a2 === undefined) {
                  this.logger.error(`No "any" channel record for ${blockPackIdToString(req.id)}`);
                  return undefined;
                }
                spec = { ...(a2.spec as BlockPackFromRegistryV2), channel: StableChannel };
              }
            } else {
              const targetChannel = this.preferredUpdateChannel ?? req.channel;
              const a1 = await registry.getLatestOverview(req.id, targetChannel);
              if (a1) spec = a1.spec;
              else {
                this.logger.error(
                  `Can't find update for ${blockPackIdToString(req.id)} in channel "${targetChannel}"`
                );
                return undefined;
              }
            }

            if (spec.type !== 'from-registry-v2') throw new Error(`Unexpected spec type ${spec}.`);

            // check that version is in fact later compared to what we already have
            if (semver.compare(spec.id.version, req.id.version) <= 0) return undefined;

            // warming cache
            // noinspection ES6MissingAwait
            (async () => {
              try {
                await registry.getComponents(spec.id);
              } catch (e: unknown) {
                this.logger.warn(e);
              }
            })();

            return spec;
          } catch (err: unknown) {
            this.logger.warn(err);
            return undefined;
          }
        }

        default:
          return undefined;
      }
    } catch (e: unknown) {
      this.logger.warn(e);
      return undefined;
    }
  }

  protected resultsEqual(
    res1: BlockPackSpec | undefined,
    res2: BlockPackSpec | undefined
  ): boolean {
    if (res1 === undefined && res2 === undefined) return true;
    if (res1 === undefined || res2 === undefined) return false;
    if (res1.type !== res2.type) return false;
    switch (res1.type) {
      case 'from-registry-v1':
        if (res2.type !== 'from-registry-v1') return false;
        return res1.registryUrl === res2.registryUrl && blockPackIdEquals(res1.id, res2.id);
      case 'from-registry-v2':
        if (res2.type !== 'from-registry-v2') return false;
        return res1.registryUrl === res2.registryUrl && blockPackIdEquals(res1.id, res2.id);
      case 'dev-v1':
        if (res2.type !== 'dev-v1') return false;
        return res1.folder === res2.folder && res1.mtime === res2.mtime;
      case 'dev-v2':
        if (res2.type !== 'dev-v2') return false;
        return res1.folder === res2.folder && res1.mtime === res2.mtime;
      default:
        assertNever(res1);
    }
  }
}
