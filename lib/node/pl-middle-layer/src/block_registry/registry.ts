import { Dispatcher, request } from 'undici';
import { RegistrySpec } from './registry_spec';
import { BlockPackSpecAny } from '../model/block_pack_spec';
import {
  GlobalOverview,
  GlobalOverviewPath,
  packageContentPrefix,
  PlPackageConfigData, PlPackageYamlConfigFile
} from '@milaboratory/pl-block-registry';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { assertNever } from '@milaboratory/ts-helpers';

export type BlockPackMeta = {
  title: string
  description: string
  [metaField: string]: unknown;
}

export type BlockPackDescription = {
  organization: string,
  package: string,
  latestVersion: string,
  latestMeta: BlockPackMeta,
  registryLabel: string,
  latestSpec: BlockPackSpecAny
}

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

export class BlockPackRegistry {
  constructor(private readonly registrySpecs: RegistrySpec[],
              private readonly http?: Dispatcher) {
  }

  private async getPackagesForRoot(regSpec: RegistrySpec): Promise<BlockPackDescription[]> {
    const result: BlockPackDescription[] = [];
    switch (regSpec.type) {
      case 'remote_v1':
        const httpOptions = this.http !== undefined
          ? { dispatcher: this.http }
          : {};

        const overviewResponse = await request(
          `${regSpec.url}/${GlobalOverviewPath}`, httpOptions);
        const overview = (await overviewResponse.body.json()) as GlobalOverview;
        for (const overviewEntry of overview) {
          const { organization, package: pkg, latestMeta, latestVersion } = overviewEntry;
          result.push({
            organization,
            package: pkg, latestVersion,
            latestMeta: latestMeta as BlockPackMeta,
            registryLabel: regSpec.label,
            latestSpec: {
              type: 'from-registry-v1',
              url: `${regSpec.url}/${packageContentPrefix({ organization, package: pkg, version: latestVersion })}`
            }
          });
        }
        return result;
      case 'folder_with_dev_packages':
        for (const entry of await fs.promises.readdir(regSpec.path, { withFileTypes: true })) {
          if (!entry.isDirectory())
            continue;

          const devPath = path.join(regSpec.path, entry.name);
          const yamlContent = await getFileContent(
            path.join(devPath, PlPackageYamlConfigFile));
          if (yamlContent === undefined)
            continue;
          const config = PlPackageConfigData.parse(YAML.parse(yamlContent));
          result.push({
            organization: config.organization,
            package: config.package, latestVersion: 'DEV',
            latestMeta: config.meta as BlockPackMeta,
            registryLabel: regSpec.label,
            latestSpec: {
              type: 'dev',
              folder: devPath
            }
          });
        }
        return result;
      default:
        return assertNever(regSpec);
    }
  }

  public async getPackages(): Promise<BlockPackDescription[]> {
    const packages: BlockPackDescription[] = [];
    for (const regSpecs of this.registrySpecs)
      packages.push(...await this.getPackagesForRoot(regSpecs));
    return packages;
  }
}
