import { RegistryStorage } from './storage';
import { randomUUID } from 'node:crypto';
import semver from 'semver/preload';
import {
  BlockPackageNameWithoutVersion,
  FullBlockPackageName, GlobalOverview,
  GlobalOverviewPath,
  MetaFile, PackageOverview,
  packageOverviewPath,
  payloadFilePath
} from './v1_repo_schema';
import { MiLogger } from '@milaboratory/ts-helpers';

function fullNameToPath(name: FullBlockPackageName): string {
  return `${name.organization}/${name.package}/${name.version}`;
}

const VersionUpdatesPrefix = '_updates_v1/per_package_version/';

function packageUpdatePath(bp: FullBlockPackageName, seed: string): string {
  return `${VersionUpdatesPrefix}${bp.organization}/${bp.package}/${bp.version}/${seed}`;
}

const PackageUpdatePattern = /(?<packageKeyWithoutVersion>(?<organization>[^\/]+)\/(?<pkg>[^\/]+))\/(?<version>[^\/]+)\/(?<seed>[^\/]+)$/;

const GlobalUpdateSeedInFile = '_updates_v1/_global_update_in';
const GlobalUpdateSeedOutFile = '_updates_v1/_global_update_out';

/*
  Note on convergence guarantee.

  Here is what S3 guarantees:

      Amazon S3 delivers strong read-after-write consistency automatically,
      without changes to performance or availability, without sacrificing
      regional isolation for applications, and at no additional cost.

      After a successful write of a new object or an overwrite of an existing
      object, any subsequent read request immediately receives the latest
      version of the object. S3 also provides strong consistency for list
      operations, so after a write, you can immediately perform a listing
      of the objects in a bucket with any changes reflected.

      https://aws.amazon.com/s3/faqs/#What_data_consistency_model_does_Amazon_S3_employ

  The following registry update schema with _update_seed / _updated_seed
  seems to guarantee eventual convergence of registry state, though I don't
  have enough time to really think it through, beware.

 */

/**
 * Layout:
 *
 *   _updates_v1/per_package/
 *     organisationA/package1/1.2.3/seedABC    <-- Tells that change happened for organisationA/package1 version 1.2.3, and reassembly of package1 overview is required
 *     organisationA/package1/1.2.3/seedCDE
 *     organisationB/package2/1.4.3/seedFGH
 *
 *   _updates_v1/_global_update_in             <-- Anybody who changes contents writes a random seed in this file
 *   _updates_v1/_global_update_out            <-- Update process writes update seed from the _global_update_in here after successful update.
 *                                                 Mismatch between contents of those files is a sign that another update should be performed.
 *
 *   v1/                                       <-- Actual block packages content
 *     organisationA/package2/1.2.3/meta.json
 *     organisationA/package2/1.2.3/main.template.plj.gz
 *     organisationA/package2/1.2.3/...
 *     organisationA/package2/overview.json    <-- Per-package aggregated meta-data over all available versions
 *     ...
 *
 *   v1/overview.json                          <-- aggregated information about all packages
 *
 */
export class BlockRegistry {
  constructor(private readonly storage: RegistryStorage, private readonly logger?: MiLogger) {
  }

  constructNewPackage(pack: FullBlockPackageName): BlockRegistryPackConstructor {
    return new BlockRegistryPackConstructor(this.storage, pack);
  }

  private async updateRegistry() {
    this.logger?.info('Initiating registry refresh...');

    // reading update requests
    const packagesToUpdate = new Map<string, PackageUpdateInfo>();
    const seedPaths: string[] = [];
    const rawSeedPaths = await this.storage.listFiles(VersionUpdatesPrefix);
    this.logger?.info('Packages to be updated:');
    for (const seedPath of rawSeedPaths) {
      const match = seedPath.match(PackageUpdatePattern);
      if (!match)
        continue;
      seedPaths.push(seedPath);
      const { packageKeyWithoutVersion, organization, pkg, version, seed } = match.groups!;

      let update = packagesToUpdate.get(packageKeyWithoutVersion);
      let added = false;
      if (!update) {
        packagesToUpdate.set(packageKeyWithoutVersion, {
          package: { organization, package: pkg },
          versions: new Set([version])
        });
        added = true;
      } else if (!update.versions.has(version)) {
        update.versions.add(version);
        added = true;
      }
      this.logger?.info(`  - ${organization}:${pkg}:${version}`);
    }

    // loading global overview
    const overviewContent = await this.storage.getFile(GlobalOverviewPath);
    let overview = overviewContent === undefined ? [] : JSON.parse(overviewContent.toString()) as GlobalOverview;
    this.logger?.info(`Global overview loaded, ${overview.length} records`);

    // updating packages
    for (const [, packageInfo] of packagesToUpdate.entries()) {
      // reading existing overview
      const overviewFile = packageOverviewPath(packageInfo.package);
      const pOverviewContent = await this.storage.getFile(overviewFile);
      let packageOverview = pOverviewContent === undefined ? [] : JSON.parse(pOverviewContent.toString()) as PackageOverview;
      this.logger?.info(`Updating ${packageInfo.package.organization}:${packageInfo.package.package} overview, ${packageOverview.length} records`);

      // removing versions that we will update
      packageOverview = packageOverview.filter(e => !packageInfo.versions.has(e.version));

      // reading new entries
      for (const [v,] of packageInfo.versions.entries()) {
        const version = v.toString();
        const metaContent = await this.storage.getFile(payloadFilePath({
          ...packageInfo.package,
          version
        }, MetaFile));
        if (!metaContent)
          continue;
        packageOverview.push({ version, meta: JSON.parse(metaContent.toString()) });
      }

      // sorting entries according to version
      packageOverview.sort((e1, e2) => semver.compare(e2.version, e1.version));

      // write package overview back
      await this.storage.putFile(overviewFile, Buffer.from(JSON.stringify(packageOverview)));
      this.logger?.info(`Done (${packageOverview.length} records)`);

      // patching corresponding entry in overview
      overview = overview.filter(e =>
        e.organization !== packageInfo.package.organization
        || e.package !== packageInfo.package.package);
      overview.push({
        organization: packageInfo.package.organization,
        package: packageInfo.package.package,
        allVersions: packageOverview.map(e => e.version).reverse(),
        latestVersion: packageOverview[0].version,
        latestMeta: packageOverview[0].meta
      });
    }

    // writing global overview
    await this.storage.putFile(GlobalOverviewPath, Buffer.from(JSON.stringify(overview)));
    this.logger?.info(`Global overview updated (${overview.length} records)`);

    // deleting seeds
    await this.storage.deleteFiles(...seedPaths.map(sp => `${VersionUpdatesPrefix}${sp}`));
    this.logger?.info(`Version update requests cleared`);
  }

  async updateIfNeeded(force: boolean = false): Promise<void> {
    // implementation of main convergence algorithm

    this.logger?.info(`Checking if registry requires refresh...`);
    const updateRequestSeed = await this.storage.getFile(GlobalUpdateSeedInFile);
    const currentUpdatedSeed = await this.storage.getFile(GlobalUpdateSeedOutFile);
    if (
      !force &&
      updateRequestSeed === undefined && currentUpdatedSeed === undefined
    )
      return;
    if (
      !force &&
      updateRequestSeed !== undefined && currentUpdatedSeed !== undefined &&
      updateRequestSeed.equals(currentUpdatedSeed)
    )
      return;

    await this.updateRegistry();

    if (updateRequestSeed) {
      await this.storage.putFile(GlobalUpdateSeedOutFile, updateRequestSeed);
      this.logger?.info(`Refresh finished`);
    }
  }

  async getPackageOverview(name: BlockPackageNameWithoutVersion): Promise<undefined | PackageOverview> {
    const content = await this.storage.getFile(packageOverviewPath(name));
    if (content === undefined)
      return undefined;
    return JSON.parse(content.toString()) as PackageOverview;
  }

  async getGlobalOverview(): Promise<undefined | GlobalOverview> {
    const content = await this.storage.getFile(GlobalOverviewPath);
    if (content === undefined)
      return undefined;
    return JSON.parse(content.toString()) as GlobalOverview;
  }
}

export class BlockRegistryPackConstructor {
  private metaAdded: boolean = false;
  public readonly seed = randomUUID();

  constructor(private readonly storage: RegistryStorage,
              public readonly name: FullBlockPackageName) {
  }

  async addFile(file: string, content: Buffer): Promise<void> {
    await this.storage.putFile(payloadFilePath(this.name, file), content);
  }

  async writeMeta(meta: object) {
    await this.addFile(MetaFile, Buffer.from(JSON.stringify(meta)));
    this.metaAdded = true;
  }

  async finish() {
    if (!this.metaAdded)
      throw new Error('meta not added');
    await this.storage.putFile(packageUpdatePath(this.name, this.seed), Buffer.of());
    await this.storage.putFile(GlobalUpdateSeedInFile, Buffer.from(this.seed));
  }
}

interface PackageUpdateInfo {
  package: BlockPackageNameWithoutVersion,
  versions: Set<String>
}
