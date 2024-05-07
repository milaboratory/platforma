import { RegistryStorage } from './storage';
import path from 'node:path';

export interface BlockPackName {
  organization: string;
  package: string;
  version: string;
}

export type PackageName = Pick<BlockPackName, 'organization' | 'package'>

const DataPrefix = 'v1/data/';
const PackagesPrefix = 'v1/packages/';

function dataFilePath(bp: BlockPackName, file: string): string {
  return `${DataPrefix}${bp.organization}/${bp.package}/${bp.version}/${file}`;
}

function packageOverviewPath(bp: PackageName): string {
  return `${PackagesPrefix}${bp.organization}/${bp.package}.json`;
}

function packageUpdataPath(bp: PackageName): string {
  return `${PackagesPrefix}${bp.organization}/${bp.package}.update`;
}

const OverviewPath = '/v1/overview.json';
const OverviewUpdatePath = '/v1/overview.update';

const MetaFile = 'meta.json';

/**
 * Layout:
 *   v1/data/          <-- actual block pack contents
 *     organisationA/package2/1.2.3/meta.json
 *     organisationA/package2/1.2.3/template.plj.gz
 *     organisationA/package2/1.2.3/...
 *     ...
 *   v1/packages/       <-- per-package aggregated data over all available versions
 *     organisationA/package1.json
 *     organisationA/package1.update <-- tells that new version or other changes happened for organisationA/package1, and reassembly of package1 is required
 *     organisationB/package2.json
 *     ...
 *   v1/overview.json
 *   v1/overview.update  <-- tells that aggregated package information was changed, and overview should be regenerated
 */
export class BlockRegistry {
  constructor(private readonly storage: RegistryStorage) {
  }


}

export class BlockRegistryPackConstructor {
  private metaAdded: boolean = false;

  constructor(private readonly storage: RegistryStorage,
              public readonly pack: BlockPackName) {
  }

  async addFile(file: string, content: Buffer): Promise<void> {
    await this.storage.putFile(dataFilePath(this.pack, file), content);
  }

  async writeMeta(meta: object) {
    await this.addFile(MetaFile, JSON.stringify());
  }

  async finish() {

  }
}
