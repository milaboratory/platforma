import { PollComputablePool, PollPoolOps } from '@milaboratories/computable';
import {
  AnyChannel,
  BlockPackFromRegistryV2,
  blockPackIdToString,
  BlockPackSpec,
  BlockSettings,
  UpdateSuggestions,
  StableChannel
} from '@milaboratories/pl-model-middle-layer';
import { Dispatcher } from 'undici';
import { getDevV1PacketMtime, getDevV2PacketMtime } from './registry';
import { tryLoadPackDescription } from '@platforma-sdk/block-tools';
import { MiLogger } from '@milaboratories/ts-helpers';
import { V2RegistryProvider } from './registry-v2-provider';
import semver from 'semver';
import canonicalize from 'canonicalize';

export const DefaultBlockUpdateWatcherOps: PollPoolOps = {
  minDelay: 1500
};

export type BlockUpdateWatcherOps = Partial<PollPoolOps> & {
  readonly http?: Dispatcher;
  readonly preferredUpdateChannel?: string;
};

const NoUpdatesKey = '__no_updates__';

export type CheckForUpdateRequest = {
  currentSpec: BlockPackSpec;
  settings: BlockSettings;
};

export type CheckForUpdateResponse = {
  suggestions: UpdateSuggestions;
  mainSuggestion?: BlockPackSpec;
};

export class BlockUpdateWatcher extends PollComputablePool<
  CheckForUpdateRequest,
  CheckForUpdateResponse
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

  protected getKey(req: CheckForUpdateRequest): string {
    switch (req.currentSpec.type) {
      case 'dev-v1':
        return `dev_1_${req.currentSpec.folder}_${req.currentSpec.mtime}`;
      case 'dev-v2':
        return `dev_2_${req.currentSpec.folder}_${req.currentSpec.mtime}`;
      case 'from-registry-v2':
        return `from_registry_v2_${canonicalize(req)!}`;
      default:
        return NoUpdatesKey;
    }
  }

  protected async readValue(req: CheckForUpdateRequest): Promise<CheckForUpdateResponse> {
    try {
      const cSpec = req.currentSpec;
      switch (cSpec.type) {
        case 'dev-v1': {
          try {
            const mtime = await getDevV1PacketMtime(cSpec.folder);
            if (mtime === cSpec.mtime) return { suggestions: [] };
            else return { mainSuggestion: { ...cSpec, mtime }, suggestions: [] };
          } catch (err: unknown) {
            this.logger.warn(err);
            return { suggestions: [] };
          }
        }

        case 'dev-v2': {
          try {
            const description = await tryLoadPackDescription(cSpec.folder, this.logger);
            if (description === undefined) return { suggestions: [] };
            const mtime = await getDevV2PacketMtime(description);
            if (mtime === cSpec.mtime) return { suggestions: [] };
            else return { mainSuggestion: { ...cSpec, mtime: mtime }, suggestions: [] };
          } catch (err: unknown) {
            this.logger.warn(err);
            return { suggestions: [] };
          }
        }

        case 'from-registry-v2': {
          try {
            const { versionLock, skipVersion } = req.settings;
            if (versionLock === 'patch') return { suggestions: [] };
            const registry = this.registryProvider.getRegistry(cSpec.registryUrl);
            let spec: BlockPackSpec | undefined;
            let channel: string | undefined = this.preferredUpdateChannel;

            if (channel === undefined) {
              if (cSpec.channel === undefined) {
                const a1 = await registry.getLatestOverview(cSpec.id, StableChannel);
                if (a1) channel = StableChannel;
                else {
                  // forcing update from non-existent channel to stable
                  const a2 = await registry.getLatestOverview(cSpec.id, AnyChannel);
                  if (a2 === undefined) {
                    this.logger.error(
                      `No "any" channel record for ${blockPackIdToString(cSpec.id)}`
                    );
                    return { suggestions: [] };
                  }
                  channel = AnyChannel;
                }
              } else channel = cSpec.channel;
            }

            const vSuggestions = await registry.getUpdateSuggestions(cSpec.id, channel);
            if (vSuggestions === undefined || vSuggestions.length === 0) return { suggestions: [] };

            // from major to patch
            vSuggestions.reverse();

            let vMainSuggestion: string | undefined = undefined;
            switch (versionLock) {
              case undefined:
                vMainSuggestion = vSuggestions[0].update;
                break;
              case 'major':
                vMainSuggestion = vSuggestions.find((v) => v.type !== 'major')?.update;
                break;
              case 'minor':
                vMainSuggestion = vSuggestions.find((v) => v.type === 'patch')?.update;
                break;
            }

            const suggestions: UpdateSuggestions = vSuggestions.map(({ type, update }) => ({
              type,
              update: { ...cSpec, id: { ...cSpec.id, version: update } }
            }));

            if (vMainSuggestion === undefined) return { suggestions };
            if (skipVersion !== undefined && semver.lte(vMainSuggestion, skipVersion))
              return { suggestions };

            const mainSuggestion: BlockPackFromRegistryV2 = {
              ...cSpec,
              id: { ...cSpec.id, version: vMainSuggestion }
            };

            // warming cache
            void (async () => {
              try {
                await registry.getComponents(mainSuggestion.id);
              } catch (e: unknown) {
                this.logger.warn(e);
              }
            })();

            return { suggestions, mainSuggestion };
          } catch (err: unknown) {
            this.logger.warn(err);
            return { suggestions: [] };
          }
        }

        default:
          return { suggestions: [] };
      }
    } catch (e: unknown) {
      this.logger.warn(e);
      return { suggestions: [] };
    }
  }

  protected resultsEqual(res1: CheckForUpdateResponse, res2: CheckForUpdateResponse): boolean {
    return canonicalize(res1) === canonicalize(res2);
    // if (res1 === undefined && res2 === undefined) return true;
    // if (res1 === undefined || res2 === undefined) return false;
    // if (res1.type !== res2.type) return false;
    // switch (res1.type) {
    //   case 'from-registry-v1':
    //     if (res2.type !== 'from-registry-v1') return false;
    //     return res1.registryUrl === res2.registryUrl && blockPackIdEquals(res1.id, res2.id);
    //   case 'from-registry-v2':
    //     if (res2.type !== 'from-registry-v2') return false;
    //     return res1.registryUrl === res2.registryUrl && blockPackIdEquals(res1.id, res2.id);
    //   case 'dev-v1':
    //     if (res2.type !== 'dev-v1') return false;
    //     return res1.folder === res2.folder && res1.mtime === res2.mtime;
    //   case 'dev-v2':
    //     if (res2.type !== 'dev-v2') return false;
    //     return res1.folder === res2.folder && res1.mtime === res2.mtime;
    //   default:
    //     assertNever(res1);
    // }
  }
}
