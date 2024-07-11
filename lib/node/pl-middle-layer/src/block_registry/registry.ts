import { Dispatcher, request } from 'undici';
import { RegistrySpec } from './registry_spec';
import { BlockPackSpecAny } from '../model';
import {
  GlobalOverview,
  GlobalOverviewPath,
  PlPackageConfigData,
  PlPackageYamlConfigFile
} from '@milaboratory/pl-block-registry';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { assertNever } from '@milaboratory/ts-helpers';
import { DevBlockPackFiles } from '../mutator/block-pack/block_pack';

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
  package: string;
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

export async function getDevPacketMtime(devPath: string): Promise<string> {
  let mtime = 0n;
  for (const f of DevBlockPackFiles) {
    const fullPath = path.join(devPath, ...f);
    const stat = await getFileStat(fullPath);
    if (stat === undefined) continue;
    if (mtime < stat.mtimeNs) mtime = stat.mtimeNs;
  }
  return mtime.toString();
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

        const overviewResponse = await request(`${regSpec.url}/${GlobalOverviewPath}`, httpOptions);
        const overview = (await overviewResponse.body.json()) as GlobalOverview;
        for (const overviewEntry of overview) {
          const { organization, package: pkg, latestMeta, latestVersion } = overviewEntry;
          result.push({
            organization,
            package: pkg,
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
          const yamlContent = await getFileContent(path.join(devPath, PlPackageYamlConfigFile));
          if (yamlContent === undefined) continue;
          const config = PlPackageConfigData.parse(YAML.parse(yamlContent));

          const mtime = await getDevPacketMtime(devPath);

          result.push({
            organization: config.organization,
            package: config.package,
            latestVersion: 'DEV',
            latestMeta: config.meta as BlockPackMeta,
            registryLabel: regSpec.label,
            latestSpec: {
              type: 'dev',
              folder: devPath,
              mtime
            },
            otherVersions: []
          });
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
