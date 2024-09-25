import type { Dispatcher} from 'undici';
import { request } from 'undici';
import type { RegistrySpec } from './registry_spec';
import type { BlockPackSpecAny } from '../model';
import type { BlockPackDescriptionAbsolute} from '@platforma-sdk/block-tools';
import { RegistryV1 } from '@platforma-sdk/block-tools';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { assertNever } from '@milaboratories/ts-helpers';
import { LegacyDevBlockPackFiles } from '../dev';
import { tryLoadPackDescription } from '@platforma-sdk/block-tools';

/**
 * Information specified by the developer of the block.
 * */
export type BlockPackMeta = {
  title: string;
  description: string;
  [metaField: string]: unknown;
};

/**
 * Information about specific package with specific organization and package names.
 * Mainly contain information about latest version of the package.
 * */
export type BlockPackPackageOverview = {
  organization: string;
  /** @deprecated */
  package: string;
  name: string;
  latestVersion: string;
  latestMeta: BlockPackMeta;
  registryLabel: string;
  latestSpec: BlockPackSpecAny;
  otherVersions: string[];
};

async function getFileContent(path: string) {
  try {
    return await fs.promises.readFile(path, 'utf8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function getFileStat(path: string) {
  try {
    return await fs.promises.stat(path, { bigint: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
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
  description: BlockPackDescriptionAbsolute
): Promise<string> {
  const mtime = 0n;
  const wfStats = await fs.promises.stat(description.components.workflow.file, { bigint: true });
  const modelStats = await fs.promises.stat(description.components.model.file, { bigint: true });
  return (wfStats.mtimeNs > modelStats.mtimeNs ? wfStats.mtimeNs : modelStats.mtimeNs).toString();
}

export class BlockPackRegistry {
  constructor(
    private readonly registrySpecs: RegistrySpec[],
    private readonly http?: Dispatcher
  ) {}

  private async getPackagesForRoot(regSpec: RegistrySpec): Promise<BlockPackPackageOverview[]> {
    const result: BlockPackPackageOverview[] = [];
    switch (regSpec.type) {
      case 'remote_v1':
        const httpOptions = this.http !== undefined ? { dispatcher: this.http } : {};

        const overviewResponse = await request(
          `${regSpec.url}/${RegistryV1.GlobalOverviewPath}`,
          httpOptions
        );
        const overview = (await overviewResponse.body.json()) as RegistryV1.GlobalOverview;
        for (const overviewEntry of overview) {
          const { organization, package: pkg, latestMeta, latestVersion } = overviewEntry;
          result.push({
            organization,
            package: pkg,
            name: pkg,
            latestVersion,
            latestMeta: latestMeta as BlockPackMeta,
            registryLabel: regSpec.label,
            latestSpec: {
              type: 'from-registry-v1',
              registryUrl: regSpec.url,
              organization,
              package: pkg,
              version: latestVersion
              // `${regSpec.url}/${packageContentPrefix({ organization, package: pkg, version: latestVersion })}`
            },
            otherVersions: overviewEntry.allVersions
          });
        }
        return result;

      case 'folder_with_dev_packages':
        for (const entry of await fs.promises.readdir(regSpec.path, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const devPath = path.join(regSpec.path, entry.name);

          const legacyYamlContent = await getFileContent(
            path.join(devPath, RegistryV1.PlPackageYamlConfigFile)
          );
          if (legacyYamlContent !== undefined) {
            const config = RegistryV1.PlPackageConfigData.parse(YAML.parse(legacyYamlContent));

            const mtime = await getDevV1PacketMtime(devPath);

            result.push({
              organization: config.organization,
              package: config.package, // TODO delete
              name: config.package,
              latestVersion: 'DEV',
              latestMeta: config.meta as BlockPackMeta,
              registryLabel: regSpec.label,
              latestSpec: {
                type: 'dev-v1',
                folder: devPath,
                mtime
              },
              otherVersions: []
            });
          }

          const v2Description = await tryLoadPackDescription(devPath);
          if (v2Description !== undefined) {
            const mtime = await getDevV2PacketMtime(v2Description);
            result.push({
              organization: v2Description.id.organization,
              package: v2Description.id.name, // TODO delete
              name: v2Description.id.name,
              latestVersion: `${v2Description.id.version}-DEV`,
              latestMeta: v2Description.meta,
              registryLabel: regSpec.label,
              latestSpec: {
                type: 'dev-v2',
                folder: devPath,
                mtime
              },
              otherVersions: []
            });
          }

          continue;
        }
        return result;
      default:
        return assertNever(regSpec);
    }
  }

  public async getPackagesOverview(): Promise<BlockPackPackageOverview[]> {
    const packages: BlockPackPackageOverview[] = [];
    for (const regSpecs of this.registrySpecs)
      packages.push(...(await this.getPackagesForRoot(regSpecs)));
    return packages;
  }
}
