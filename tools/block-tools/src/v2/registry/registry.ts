import { MiLogger } from '@milaboratories/ts-helpers';
import { compare as compareSemver, satisfies } from 'semver';
import { RegistryStorage } from '../../lib/storage';
import { BlockPackIdNoVersion, BlockPackManifest } from '@milaboratories/pl-model-middle-layer';
import {
  GlobalUpdateSeedInFile,
  GlobalUpdateSeedOutFile,
  PackageUpdatePattern,
  VersionUpdatesPrefix
} from './schema_internal';
import {
  GlobalOverviewReg,
  GlobalOverviewPath,
  ManifestSuffix,
  packageContentPrefix,
  PackageOverview,
  packageOverviewPath
} from './schema_public';
import { BlockPackDescriptionManifestAddRelativePathPrefix, RelativeContentReader } from '../model';

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
    const overview: GlobalOverviewReg =
      overviewContent === undefined
        ? { schema: 'v2', packages: [] }
        : GlobalOverviewReg.parse(JSON.parse(overviewContent.toString()));
    let overviewPackages = overview.packages;
    this.logger?.info(`Global overview loaded, ${overviewPackages.length} records`);

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
      const newVersions = packageOverview.versions.filter(
        (e) => !packageInfo.versions.has(e.id.version)
      );

      // reading new entries
      for (const [v] of packageInfo.versions.entries()) {
        const version = v.toString();
        const manifestContent = await this.storage.getFile(
          packageContentPrefix({
            ...packageInfo.package,
            version
          }) + ManifestSuffix
        );
        if (!manifestContent) continue; // absent package
        newVersions.push(
          BlockPackDescriptionManifestAddRelativePathPrefix(version).parse(
            JSON.parse(manifestContent.toString('utf8'))
          )
        );
      }

      // sorting entries according to version
      newVersions.sort((e1, e2) => compareSemver(e2.id.version, e1.id.version));

      // write package overview back
      await this.storage.putFile(
        overviewFile,
        Buffer.from(
          JSON.stringify({ schema: 'v2', versions: newVersions } satisfies PackageOverview)
        )
      );
      this.logger?.info(`Done (${newVersions.length} records)`);

      // patching corresponding entry in overview
      overviewPackages = overviewPackages.filter(
        (e) =>
          e.id.organization !== packageInfo.package.organization ||
          e.id.name !== packageInfo.package.name
      );
      overviewPackages.push({
        id: {
          organization: packageInfo.package.organization,
          name: packageInfo.package.name
        },
        allVersions: newVersions.map((e) => e.id.version).reverse(),
        latest: BlockPackDescriptionManifestAddRelativePathPrefix(packageInfo.package.name).parse(
          newVersions[0]
        )
      });
    }

    // writing global overview
    await this.storage.putFile(
      GlobalOverviewPath,
      Buffer.from(
        JSON.stringify({ schema: 'v2', packages: overviewPackages } satisfies GlobalOverviewReg)
      )
    );
    this.logger?.info(`Global overview updated (${overviewPackages.length} records)`);

    // deleting seeds
    await this.storage.deleteFiles(...seedPaths.map((sp) => `${VersionUpdatesPrefix}${sp}`));
    this.logger?.info(`Version update requests cleared`);
  }

  public async updateIfNeeded(force: boolean = false): Promise<void> {
    // implementation of main convergence algorithm

    this.logger?.info(`Checking if registry requires refresh...`);
    const updateRequestSeed = await this.storage.getFile(GlobalUpdateSeedInFile);
    const currentUpdatedSeed = await this.storage.getFile(GlobalUpdateSeedOutFile);
    if (!force && updateRequestSeed === undefined && currentUpdatedSeed === undefined) return;
    if (
      !force &&
      updateRequestSeed !== undefined &&
      currentUpdatedSeed !== undefined &&
      updateRequestSeed.equals(currentUpdatedSeed)
    )
      return;

    await this.updateRegistry();

    if (updateRequestSeed) {
      await this.storage.putFile(GlobalUpdateSeedOutFile, updateRequestSeed);
      this.logger?.info(`Refresh finished`);
    }
  }

  public async getPackageOverview(
    name: BlockPackIdNoVersion
  ): Promise<undefined | PackageOverview> {
    const content = await this.storage.getFile(packageOverviewPath(name));
    if (content === undefined) return undefined;
    return PackageOverview.parse(JSON.parse(content.toString()));
  }

  public async getGlobalOverview(): Promise<undefined | GlobalOverviewReg> {
    const content = await this.storage.getFile(GlobalOverviewPath);
    if (content === undefined) return undefined;
    return GlobalOverviewReg.parse(JSON.parse(content.toString()));
  }

  public async getGlobalOverviewExplicitBytes(): Promise<undefined | GlobalOverviewReg> {
    const content = await this.storage.getFile(GlobalOverviewPath);
    if (content === undefined) return undefined;
    return GlobalOverviewReg.parse(JSON.parse(content.toString()));
  }

  public async publishPackage(
    manifest: BlockPackManifest,
    fileReader: RelativeContentReader
  ): Promise<void> {
    
  }
}
