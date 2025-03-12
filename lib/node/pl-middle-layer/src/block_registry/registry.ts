import type { Dispatcher } from 'undici';
import { request } from 'undici';
import type {
  BlockPackDescriptionAbsolute } from '@platforma-sdk/block-tools';
import {
  BlockPackMetaEmbedAbsoluteBytes,
  RegistryV1,
} from '@platforma-sdk/block-tools';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { assertNever } from '@milaboratories/ts-helpers';
import { LegacyDevBlockPackFiles } from '../dev_env';
import { tryLoadPackDescription } from '@platforma-sdk/block-tools';
import type { V2RegistryProvider } from './registry-v2-provider';
import type {
  BlockPackId,
  BlockPackListing,
  BlockPackOverview,
  RegistryEntry,
  RegistryStatus,
  SingleBlockPackOverview } from '@milaboratories/pl-model-middle-layer';
import {
  AnyChannel,
  StableChannel,
} from '@milaboratories/pl-model-middle-layer';

async function getFileContent(path: string) {
  try {
    return await fs.promises.readFile(path, 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function getFileStat(path: string) {
  try {
    return await fs.promises.stat(path, { bigint: true });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function getDevV1PacketMtime(devPath: string): Promise<string> {
  let mtime = 0n;
  for (const f of LegacyDevBlockPackFiles) {
    const fullPath = path.join(devPath, ...f);
    const stat = await getFileStat(fullPath);
    if (stat === undefined) continue;
    if (mtime < stat.mtimeNs) mtime = stat.mtimeNs;
  }
  return mtime.toString();
}

export async function getDevV2PacketMtime(
  description: BlockPackDescriptionAbsolute,
): Promise<string> {
  const wfStats = await fs.promises.stat(description.components.workflow.main.file, {
    bigint: true,
  });
  const modelStats = await fs.promises.stat(description.components.model.file, { bigint: true });
  return (wfStats.mtimeNs > modelStats.mtimeNs ? wfStats.mtimeNs : modelStats.mtimeNs).toString();
}

export class BlockPackRegistry {
  constructor(
    private readonly v2Provider: V2RegistryProvider,
    private readonly registries: RegistryEntry[],
    private readonly http?: Dispatcher,
  ) {}

  private async getPackagesForRoot(regEntry: RegistryEntry): Promise<BlockPackOverview[]> {
    const result: BlockPackOverview[] = [];
    const regSpec = regEntry.spec;
    switch (regSpec.type) {
      case 'remote-v1':
      {
        const httpOptions = this.http !== undefined ? { dispatcher: this.http } : {};

        const overviewResponse = await request(
          `${regSpec.url}/${RegistryV1.GlobalOverviewPath}`,
          httpOptions,
        );
        const overview = (await overviewResponse.body.json()) as RegistryV1.GlobalOverview;
        for (const overviewEntry of overview) {
          const { organization, package: pkg, latestMeta, latestVersion } = overviewEntry;
          const id = {
            organization,
            name: pkg,
            version: latestVersion,
          };
          const latestOverview: SingleBlockPackOverview = {
            id,
            meta: {
              title: latestMeta['title'] ?? 'No title',
              description: latestMeta['description'] ?? 'No Description',
              organization: {
                name: organization,
                url: 'https://unknown.com',
              },
            },
            spec: {
              type: 'from-registry-v1',
              id,
              registryUrl: regSpec.url,
            },
          };
          result.push({
            registryId: regEntry.id,
            id,
            latestByChannel: {
              [AnyChannel]: latestOverview,
              [StableChannel]: latestOverview,
            },
            allVersions: overviewEntry.allVersions.map((v) => ({ version: v, channels: [] })),
          });
        }
        return result;
      }

      case 'remote-v2':
        return (await this.v2Provider.getRegistry(regSpec.url).listBlockPacks())
          .map((e) => ({ ...e, registryId: regEntry.id }));
        // e.latestByChannel[StableChannel]
        //   ? {
        //       ...e,
        //       registryId: regEntry.id,
        //     }
        //   : {
        //       ...e,
        //       latestByChannel: {
        //         ...e.latestByChannel,
        //         [StableChannel]: ((s: SingleBlockPackOverview) => {
        //           if (s.spec.type === 'from-registry-v2') {
        //             return { ...s, spec: { ...s.spec, channel: StableChannel } };
        //           }

        //           return s;
        //         })(e.latestByChannel[AnyChannel]),
        //       },
        //       registryId: regEntry.id,
        //     },

      case 'local-dev':
        for (const entry of await fs.promises.readdir(regSpec.path, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const devPath = path.join(regSpec.path, entry.name);

          const legacyYamlContent = await getFileContent(
            path.join(devPath, RegistryV1.PlPackageYamlConfigFile),
          );
          if (legacyYamlContent !== undefined) {
            const config = RegistryV1.PlPackageConfigData.parse(YAML.parse(legacyYamlContent));

            const mtime = await getDevV1PacketMtime(devPath);

            const id = {
              organization: config.organization,
              name: config.package,
              version: 'DEV',
            };

            const latestOverview: SingleBlockPackOverview = {
              id,
              meta: {
                title: (config.meta['title'] as string) ?? 'No title',
                description: (config.meta['description'] as string) ?? 'No Description',
                organization: {
                  name: config.organization,
                  url: 'https://unknown.com',
                },
              },
              spec: {
                type: 'dev-v2',
                folder: devPath,
                mtime,
              },
            };

            result.push({
              registryId: regEntry.id,
              id,
              latestByChannel: {
                [AnyChannel]: latestOverview,
                [StableChannel]: latestOverview,
              },
              allVersions: [],
            });
          } else {
            let actualDevPath = devPath;
            let v2Description = await tryLoadPackDescription(actualDevPath);

            if (v2Description === undefined)
              // iterating over expected subfolder names where block developer may put root block-pack package
              for (const bpSubfolder of ['block', 'meta']) {
                actualDevPath = path.join(devPath, bpSubfolder);
                v2Description = await tryLoadPackDescription(actualDevPath);
                if (v2Description !== undefined) break;
              }

            if (v2Description !== undefined) {
              const mtime = await getDevV2PacketMtime(v2Description);

              const latestOverview: SingleBlockPackOverview = {
                id: v2Description.id,
                meta: await BlockPackMetaEmbedAbsoluteBytes.parseAsync(v2Description.meta),
                spec: {
                  type: 'dev-v2',
                  folder: actualDevPath,
                  mtime,
                },
              };

              result.push({
                registryId: regEntry.id,
                id: v2Description.id,
                latestByChannel: {
                  [AnyChannel]: latestOverview,
                  [StableChannel]: latestOverview,
                },
                allVersions: [],
              });
            }
          }

          continue;
        }
        return result;
      default:
        return assertNever(regSpec);
    }
  }

  public async listBlockPacks(): Promise<BlockPackListing> {
    const blockPacks: BlockPackOverview[] = [];
    const registries: RegistryStatus[] = [];
    for (const regSpecs of this.registries) {
      registries.push({ ...regSpecs, status: 'online' });
      blockPacks.push(...(await this.getPackagesForRoot(regSpecs)));
    }
    return { registries, blockPacks };
  }

  public async getOverview(
    registryId: string,
    blockId: BlockPackId,
    channel: string,
  ): Promise<SingleBlockPackOverview> {
    const regSpec = this.registries.find((reg) => reg.id === registryId)?.spec;
    if (!regSpec) throw new Error(`Registry with id "${registryId}" not found`);
    if (regSpec.type !== 'remote-v2')
      throw new Error(
        `Only "remote-v2" registries support specific package version overview retrieval.`,
      );
    const reg = this.v2Provider.getRegistry(regSpec.url);
    return await reg.getSpecificOverview(blockId, channel);
  }
}
