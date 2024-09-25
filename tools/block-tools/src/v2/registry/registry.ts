import { MiLogger } from '@milaboratories/ts-helpers';
import { RegistryStorage } from '../../lib/storage';
import { BlockPackIdNoVersion } from '@milaboratories/pl-model-middle-layer';
import { PackageUpdatePattern, VersionUpdatesPrefix } from './schema_internal';
import {
  GlobalOverview,
  GlobalOverviewPath,
  PackageOverview,
  packageOverviewPath
} from './schema_public';

type PackageUpdateInfo = {
  package: BlockPackIdNoVersion;
  versions: Set<String>;
};

export class BlockRegistryV2 {
  constructor(
    private readonly storage: RegistryStorage,
    private readonly logger?: MiLogger
  ) {}

  private async updateRegistry() {
    this.logger?.info('Initiating registry refresh...');

    // reading update requests
    const packagesToUpdate = new Map<string, PackageUpdateInfo>();
    const seedPaths: string[] = [];
    const rawSeedPaths = await this.storage.listFiles(VersionUpdatesPrefix);
    this.logger?.info('Packages to be updated:');
    for (const seedPath of rawSeedPaths) {
      const match = seedPath.match(PackageUpdatePattern);
      if (!match) continue;
      seedPaths.push(seedPath);
      const { packageKeyWithoutVersion, organization, name, version, seed } = match.groups!;

      let update = packagesToUpdate.get(packageKeyWithoutVersion);
      let added = false;
      if (!update) {
        packagesToUpdate.set(packageKeyWithoutVersion, {
          package: { organization, name },
          versions: new Set([version])
        });
        added = true;
      } else if (!update.versions.has(version)) {
        update.versions.add(version);
        added = true;
      }
      this.logger?.info(`  - ${organization}:${name}:${version} added:${added}`);
    }

    // loading global overview
    const overviewContent = await this.storage.getFile(GlobalOverviewPath);
    let overview: GlobalOverview =
      overviewContent === undefined
        ? { schema: 'v2', packages: [] }
        : GlobalOverview.parse(JSON.parse(overviewContent.toString()));
    this.logger?.info(`Global overview loaded, ${overview.packages.length} records`);

    // updating packages
    for (const [, packageInfo] of packagesToUpdate.entries()) {
      // reading existing overview
      const overviewFile = packageOverviewPath(packageInfo.package);
      const pOverviewContent = await this.storage.getFile(overviewFile);
      let packageOverview: PackageOverview =
        pOverviewContent === undefined
          ? { schema: 'v2', versions: [] }
          : PackageOverview.parse(JSON.parse(pOverviewContent.toString()));
      this.logger?.info(
        `Updating ${packageInfo.package.organization}:${packageInfo.package.name} overview, ${packageOverview.versions.length} records`
      );

      // removing versions that we will update
      packageOverview = packageOverview.filter((e) => !packageInfo.versions.has(e.version));

      // reading new entries
      for (const [v] of packageInfo.versions.entries()) {
        const version = v.toString();
        const metaContent = await this.storage.getFile(
          payloadFilePath(
            {
              ...packageInfo.package,
              version
            },
            MetaFile
          )
        );
        if (!metaContent) continue;
        packageOverview.push({ version, meta: JSON.parse(metaContent.toString()) });
      }

      // sorting entries according to version
      packageOverview.sort((e1, e2) => semver.compare(e2.version, e1.version));

      // write package overview back
      await this.storage.putFile(overviewFile, Buffer.from(JSON.stringify(packageOverview)));
      this.logger?.info(`Done (${packageOverview.length} records)`);

      // patching corresponding entry in overview
      overview = overview.filter(
        (e) =>
          e.organization !== packageInfo.package.organization ||
          e.package !== packageInfo.package.package
      );
      overview.push({
        organization: packageInfo.package.organization,
        package: packageInfo.package.package,
        allVersions: packageOverview.map((e) => e.version).reverse(),
        latestVersion: packageOverview[0].version,
        latestMeta: packageOverview[0].meta
      });
    }

    // writing global overview
    await this.storage.putFile(GlobalOverviewPath, Buffer.from(JSON.stringify(overview)));
    this.logger?.info(`Global overview updated (${overview.length} records)`);

    // deleting seeds
    await this.storage.deleteFiles(...seedPaths.map((sp) => `${VersionUpdatesPrefix}${sp}`));
    this.logger?.info(`Version update requests cleared`);
  }
}
