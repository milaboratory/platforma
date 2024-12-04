import { ConsoleLoggerAdapter, MiLogger } from '@milaboratories/ts-helpers';
import { compare as compareSemver, satisfies } from 'semver';
import { RegistryStorage } from '../../io/storage';
import {
  AnyChannel,
  BlockPackId,
  BlockPackIdNoVersion,
  blockPackIdToString,
  BlockPackManifest
} from '@milaboratories/pl-model-middle-layer';
import {
  GlobalUpdateSeedInFile,
  GlobalUpdateSeedOutFile,
  PackageUpdatePattern,
  packageUpdateSeedPath,
  VersionUpdatesPrefix
} from './schema_internal';
import {
  GlobalOverviewReg,
  GlobalOverviewPath,
  ManifestSuffix,
  packageContentPrefix,
  PackageOverview,
  packageOverviewPath,
  ManifestFileName,
  ChannelsFolder,
  packageChannelPrefix,
  ChannelNameRegexp
} from './schema_public';
import { BlockPackDescriptionManifestAddRelativePathPrefix, RelativeContentReader } from '../model';
import { randomUUID } from 'node:crypto';
import { calculateSha256 } from '../../util';
import { z } from 'zod';
import { version } from 'node:os';

type PackageUpdateInfo = {
  package: BlockPackIdNoVersion;
  versions: Set<String>;
};

export class BlockRegistryV2 {
  constructor(
    private readonly storage: RegistryStorage,
    private readonly logger: MiLogger = new ConsoleLoggerAdapter()
  ) {}

  private async updateRegistry(dryRun: boolean = false) {
    this.logger.info('Initiating registry refresh...');

    // reading update requests
    const packagesToUpdate = new Map<string, PackageUpdateInfo>();
    const seedPaths: string[] = [];
    const rawSeedPaths = await this.storage.listFiles(VersionUpdatesPrefix);
    this.logger.info('Packages to be updated:');
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
      this.logger.info(`  - ${organization}:${name}:${version} added:${added}`);
    }

    // loading global overview
    const overviewContent = await this.storage.getFile(GlobalOverviewPath);
    const overview: GlobalOverviewReg =
      overviewContent === undefined
        ? { schema: 'v2', packages: [] }
        : GlobalOverviewReg.parse(JSON.parse(overviewContent.toString()));
    let overviewPackages = overview.packages;
    this.logger.info(`Global overview loaded, ${overviewPackages.length} records`);

    // updating packages
    for (const [, packageInfo] of packagesToUpdate.entries()) {
      // reading existing overview
      const overviewFile = packageOverviewPath(packageInfo.package);
      const pOverviewContent = await this.storage.getFile(overviewFile);
      const packageOverview: PackageOverview =
        pOverviewContent === undefined
          ? { schema: 'v2', versions: [] }
          : PackageOverview.parse(JSON.parse(pOverviewContent.toString()));
      this.logger.info(
        `Updating ${packageInfo.package.organization}:${packageInfo.package.name} overview, ${packageOverview.versions.length} records`
      );

      // removing versions that we will update
      const newVersions = packageOverview.versions.filter(
        (e) => !packageInfo.versions.has(e.description.id.version)
      );

      // reading new entries
      for (const [v] of packageInfo.versions.entries()) {
        const version = v.toString();
        const id: BlockPackId = {
          ...packageInfo.package,
          version
        };
        const manifestContent = await this.storage.getFile(
          packageContentPrefix(id) + ManifestSuffix
        );
        if (!manifestContent) continue; // absent package
        const sha256 = await calculateSha256(manifestContent);
        // listing channels
        const channels = (await this.storage.listFiles(packageChannelPrefix(id))).filter((f) => {
          if (f.match(ChannelNameRegexp)) return true;
          else {
            this.logger.warn(`Unexpected channel in ${blockPackIdToString(id)}: ${f}`);
            return false;
          }
        });
        // pushing the overview
        newVersions.push({
          description: BlockPackDescriptionManifestAddRelativePathPrefix(version).parse(
            BlockPackManifest.parse(JSON.parse(manifestContent.toString('utf8'))).description
          ),
          manifestSha256: sha256,
          channels
        });
      }

      // sorting entries according to version
      newVersions.sort((e1, e2) =>
        compareSemver(e2.description.id.version, e1.description.id.version)
      );

      // write package overview back
      if (!dryRun)
        await this.storage.putFile(
          overviewFile,
          Buffer.from(
            JSON.stringify({ schema: 'v2', versions: newVersions } satisfies PackageOverview)
          )
        );
      this.logger.info(`Done (${newVersions.length} records)`);

      // calculating all channels
      const allChannels = new Set<string>();
      for (const v of newVersions) for (const c of v.channels) allChannels.add(c);

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
        // left for backward compatibility
        allVersions: newVersions.map((e) => e.description.id.version).reverse(),
        allVersionsWithChannels: newVersions
          .map((e) => ({ version: e.description.id.version, channels: e.channels }))
          .reverse(),
        // left for backward compatibility
        latest: BlockPackDescriptionManifestAddRelativePathPrefix(
          `${packageInfo.package.organization}/${packageInfo.package.name}`
        ).parse(newVersions[0].description),
        // left for backward compatibility
        latestManifestSha256: newVersions[0].manifestSha256,
        latestByChannel: Object.fromEntries(
          [...allChannels, AnyChannel].map((c) => {
            // if c === 'any' the first element will be "found"
            const v = newVersions.find((v) => c === AnyChannel || v.channels.indexOf(c) !== -1);
            if (!v) throw new Error('Assertion error');
            return [c, { description: v.description, manifestSha256: v?.manifestSha256 }];
          })
        )
      });
    }

    // writing global overview
    if (!dryRun)
      await this.storage.putFile(
        GlobalOverviewPath,
        Buffer.from(
          JSON.stringify({ schema: 'v2', packages: overviewPackages } satisfies GlobalOverviewReg)
        )
      );
    this.logger.info(`Global overview updated (${overviewPackages.length} records)`);

    // deleting seeds
    if (!dryRun)
      await this.storage.deleteFiles(...seedPaths.map((sp) => `${VersionUpdatesPrefix}${sp}`));
    this.logger.info(`Version update requests cleared`);
  }

  public async updateIfNeeded(mode: 'force' | 'normal' | 'dry-run' = 'normal'): Promise<void> {
    // implementation of main convergence algorithm

    this.logger.info(`Checking if registry requires refresh...`);
    const updateRequestSeed = await this.storage.getFile(GlobalUpdateSeedInFile);
    const currentUpdatedSeed = await this.storage.getFile(GlobalUpdateSeedOutFile);
    if (mode !== 'force' && updateRequestSeed === undefined && currentUpdatedSeed === undefined) {
      this.logger.info(`No global seed files found, update not needed.`);
      return;
    }
    if (
      mode !== 'force' &&
      updateRequestSeed !== undefined &&
      currentUpdatedSeed !== undefined &&
      updateRequestSeed.equals(currentUpdatedSeed)
    ) {
      this.logger.info(`Registry is up to date.`);
      return;
    }

    await this.updateRegistry(mode === 'dry-run');

    if (updateRequestSeed) {
      if (mode !== 'dry-run')
        await this.storage.putFile(GlobalUpdateSeedOutFile, updateRequestSeed);
      this.logger.info(`Refresh finished.`);
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

  private async marchChanged(id: BlockPackId) {
    // adding update seed
    const seed = randomUUID();
    const seedPath = packageUpdateSeedPath(id, seed);
    this.logger.info(`Creating update seed at ${seedPath} ...`);
    await this.storage.putFile(seedPath, Buffer.from(seed));
    this.logger.info(`Touching global update seed ${GlobalUpdateSeedInFile} ...`);
    await this.storage.putFile(GlobalUpdateSeedInFile, Buffer.from(seed));
  }

  public async addPackageToChannel(id: BlockPackId, channel: string) {
    if (!channel.match(ChannelNameRegexp))
      throw new Error(`Illegal characters in channel name: ${channel}`);
    const prefix = packageContentPrefix(id);
    // checking package exists
    if ((await this.storage.getFile(`${prefix}/${ManifestFileName}`)) === undefined)
      throw new Error(`Package ${blockPackIdToString(id)} not found in the registry.`);
    // adding to channel
    await this.storage.putFile(`${prefix}/${ChannelsFolder}/${channel}`, Buffer.from(channel));
    // marking as changed
    await this.marchChanged(id);
  }

  public async removePackageFromChannel(id: BlockPackId, channel: string) {
    if (!channel.match(ChannelNameRegexp))
      throw new Error(`Illegal characters in channel name: ${channel}`);
    const prefix = packageContentPrefix(id);
    // checking package exists
    if ((await this.storage.getFile(`${prefix}/${ManifestFileName}`)) === undefined)
      throw new Error(`Package ${blockPackIdToString(id)} not found in the registry.`);
    // adding to channel
    await this.storage.deleteFiles(`${prefix}/${ChannelsFolder}/${channel}`);
    // marking as changed
    await this.marchChanged(id);
  }

  public async publishPackage(
    manifest: BlockPackManifest,
    fileReader: RelativeContentReader
  ): Promise<void> {
    const prefix = packageContentPrefix(manifest.description.id);
    // uploading content files
    for (const f of manifest.files) {
      const bytes = await fileReader(f.name);
      if (bytes.length !== f.size)
        throw new Error(
          `Actual file size don't match file size from the manifest file for ${f.name} (actual = ${bytes.length}; manifest = ${f.size})`
        );
      const sha256 = await calculateSha256(bytes);
      if (sha256 !== f.sha256.toUpperCase())
        throw new Error(
          `Actual file SHA-256 don't match the checksum from the manifest file for ${f.name} (actual = ${sha256}; manifest = ${f.sha256.toUpperCase()})`
        );

      const dst = prefix + '/' + f.name;
      this.logger.info(`Uploading ${f.name} -> ${dst} ...`);
      await this.storage.putFile(dst, bytes);
    }

    // uploading manifest as the last upload action
    const manifestDst = prefix + '/' + ManifestFileName;
    this.logger.info(`Uploading manifest to ${manifestDst} ...`);
    await this.storage.putFile(manifestDst, Buffer.from(JSON.stringify(manifest)));

    await this.marchChanged(manifest.description.id);
  }
}
