import type { MiLogger } from "@milaboratories/ts-helpers";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import { compare as compareSemver } from "semver";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import type { RegistryStorage } from "../../io/storage";
import type { BlockPackId, BlockPackIdNoVersion } from "@milaboratories/pl-model-middle-layer";
import {
  AnyChannel,
  blockPackIdToString,
  BlockPackManifest,
} from "@milaboratories/pl-model-middle-layer";
import { parseKindRef } from "@milaboratories/pl-model-common";
import {
  GlobalUpdateSeedInFile,
  GlobalUpdateSeedOutFile,
  PackageUpdatePattern,
  packageUpdateSeedPath,
  VersionUpdatesPrefix,
  GlobalOverviewSnapshotPattern,
  GlobalSnapshotsPrefix,
  globalOverviewSnapshotPath,
  packageOverviewSnapshotPath,
} from "./schema_internal";
import type { GlobalOverviewReg } from "./schema_public";
import {
  parseGlobalOverviewReg,
  GlobalOverviewPath,
  GlobalOverviewGzPath,
  ManifestSuffix,
  packageContentPrefix,
  PackageOverview,
  packageOverviewPath,
  ManifestFileName,
  ChannelsFolder,
  packageChannelPrefix,
  ChannelNameRegexp,
  MainPrefix,
  PackageManifestPattern,
} from "./schema_public";
import {
  KindsPrefix,
  KindManifest,
  KindManifestFileName,
  KindOverview,
  KindOverviewPathPattern,
  kindContentPrefix,
  kindOverviewPath,
  npmNameToKindPath,
} from "./schema_kinds";
import type { KindImplementer, KindVersionOverview } from "./schema_kinds";
import type { RelativeContentReader } from "../model";
import { addRelativePathPrefix } from "../model";
import { randomUUID } from "node:crypto";
import { calculateSha256 } from "../../util";

export interface BlockRegistrySettings {
  skipSnapshotCreation?: boolean;
}

export interface GlobalOverviewBackupDescription {
  timestamp: string;
  path: string;
}

type PackageUpdateInfo = {
  package: BlockPackIdNoVersion;
  versions: Set<string>;
};

/**
 * Accumulator for the kind-overview projection, keyed by
 * `kinds/{org}/{name}/overview.json`. Filled while the block manifests are
 * already parsed in the main `updateRegistry` pass — no extra reads.
 *
 * `touched` is the set of block id strings re-read this pass (removed from the
 * existing overview before their fresh implementer entries are re-added). In
 * force mode it is `null`: the overview is fully rebuilt from the scan, so the
 * existing content is discarded rather than filtered.
 */
type KindTouchAccumulator = {
  touched: Set<string> | null;
  add: KindImplementer[];
};

export class BlockRegistryV2 {
  private readonly gzipAsync = promisify(gzip);
  private readonly gunzipAsync = promisify(gunzip);

  constructor(
    private readonly storage: RegistryStorage,
    private readonly logger: MiLogger = new ConsoleLoggerAdapter(),
    private readonly settings: BlockRegistrySettings = {},
  ) {}

  private generateTimestamp(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\.(\d{3})Z$/, ".$1Z");
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    return `${timestamp}-${randomSuffix}`;
  }

  private generatePreWriteTimestamp(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\.(\d{3})Z$/, ".$1Z");
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    return `${timestamp}-prewrite-${randomSuffix}`;
  }

  private async createGlobalOverviewSnapshot(
    overviewData: string,
    timestamp: string,
  ): Promise<void> {
    if (this.settings.skipSnapshotCreation) return;

    try {
      const gzippedData = await this.gzipAsync(overviewData);
      const snapshotPath = globalOverviewSnapshotPath(timestamp);
      await this.storage.putFile(snapshotPath, Buffer.from(gzippedData));
      this.logger.info(`Global overview snapshot created at ${snapshotPath}`);
    } catch (error) {
      this.logger.warn(`Failed to create global overview snapshot: ${String(error)}`);
    }
  }

  private async createPackageOverviewSnapshot(
    pkg: BlockPackIdNoVersion,
    overview: PackageOverview,
    timestamp: string,
  ): Promise<void> {
    if (this.settings.skipSnapshotCreation) return;

    try {
      const overviewData = JSON.stringify(overview);
      const gzippedData = await this.gzipAsync(overviewData);
      const snapshotPath = packageOverviewSnapshotPath(pkg, timestamp);
      await this.storage.putFile(snapshotPath, Buffer.from(gzippedData));
      this.logger.info(
        `Package overview snapshot created at ${snapshotPath} for ${pkg.organization}:${pkg.name}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to create package overview snapshot for ${pkg.organization}:${pkg.name}: ${String(error)}`,
      );
    }
  }

  private async updateRegistry(mode: "force" | "normal" | "dry-run" = "normal") {
    this.logger.info("Initiating registry refresh...");

    // Generate timestamp for all snapshots in this run
    const snapshotTimestamp = this.generateTimestamp();

    // reading update requests
    const packagesToUpdate = new Map<string, PackageUpdateInfo>();
    // kind-overview projection accumulator, keyed by kinds/{org}/{name}/overview.json
    const touchedKinds = new Map<string, KindTouchAccumulator>();
    const seedPaths: string[] = [];
    const rawSeedPaths = await this.storage.listFiles(VersionUpdatesPrefix);

    const addVersionToBeUpdated = ({ organization, name, version }: BlockPackId) => {
      const keyNoVersion = `${organization}:${name}`;
      const update = packagesToUpdate.get(keyNoVersion);
      if (!update) {
        packagesToUpdate.set(keyNoVersion, {
          package: { organization, name },
          versions: new Set([version]),
        });
        return true;
      } else if (!update.versions.has(version)) {
        update.versions.add(version);
        return true;
      }
      return false;
    };

    this.logger.info("Packages to be updated:");
    for (const seedPath of rawSeedPaths) {
      const match = seedPath.match(PackageUpdatePattern);
      if (!match) continue;
      seedPaths.push(seedPath);
      const { organization, name, version, seed: _seed } = match.groups!;
      const added = addVersionToBeUpdated({ organization, name, version });
      this.logger.info(`  - ${organization}:${name}:${version} added:${added}`);
    }

    if (mode === "force") {
      // Listing all the packages with all the versions and adding them to the list of packages to be updated
      const allPaths = await this.storage.listFiles(MainPrefix);
      for (const path of allPaths) {
        const match = path.match(PackageManifestPattern);
        if (!match) continue;
        const { organization, name, version } = match.groups!;
        const added = addVersionToBeUpdated({ organization, name, version });
        this.logger.info(`  - ${organization}:${name}:${version} force_added:${added}`);
      }

      // Seed every existing kind overview empty so kinds orphaned by
      // migration/removal are rewritten (or deleted) this pass. The block scan
      // above already re-enumerates every live kind ref (refs live inside block
      // manifests); this LIST exists solely to reset orphans.
      const kindPaths = await this.storage.listFiles(KindsPrefix);
      for (const rel of kindPaths) {
        if (!KindOverviewPathPattern.test(rel)) continue;
        touchedKinds.set(KindsPrefix + rel, { touched: null, add: [] });
      }
    }

    // loading global overview
    const overviewContent = await this.storage.getFile(GlobalOverviewPath);

    // Create pre-write snapshot in force mode if overview exists
    if (mode === "force" && overviewContent !== undefined) {
      const preWriteTimestamp = this.generatePreWriteTimestamp();
      await this.createGlobalOverviewSnapshot(overviewContent.toString(), preWriteTimestamp);
    }

    const overview: GlobalOverviewReg =
      mode === "force"
        ? { schema: "v2", packages: [] }
        : overviewContent === undefined
          ? { schema: "v2", packages: [] }
          : parseGlobalOverviewReg(JSON.parse(overviewContent.toString()));
    let overviewPackages = overview.packages;
    this.logger.info(
      `Global overview ${mode === "force" ? "starting empty (force mode)" : "loaded"}, ${overviewPackages.length} records`,
    );

    // updating packages
    for (const [, packageInfo] of packagesToUpdate.entries()) {
      // reading existing overview
      const overviewFile = packageOverviewPath(packageInfo.package);
      const pOverviewContent = await this.storage.getFile(overviewFile);

      // Create pre-write snapshot in force mode if package overview exists
      if (mode === "force" && pOverviewContent !== undefined) {
        const preWriteTimestamp = this.generatePreWriteTimestamp();
        const existingOverview = PackageOverview.parse(JSON.parse(pOverviewContent.toString()));
        await this.createPackageOverviewSnapshot(
          packageInfo.package,
          existingOverview,
          preWriteTimestamp,
        );
      }

      const packageOverview: PackageOverview =
        mode === "force"
          ? { schema: "v2", versions: [] }
          : pOverviewContent === undefined
            ? { schema: "v2", versions: [] }
            : PackageOverview.parse(JSON.parse(pOverviewContent.toString()));
      this.logger.info(
        `Updating ${packageInfo.package.organization}:${packageInfo.package.name} overview${mode === "force" ? " (starting empty in force mode)" : ""}, ${packageOverview.versions.length} records`,
      );

      // removing versions that we will update
      const newVersions = packageOverview.versions.filter(
        (e) => !packageInfo.versions.has(e.description.id.version),
      );

      // reading new entries
      for (const [v] of packageInfo.versions.entries()) {
        const version = v.toString();
        const id: BlockPackId = {
          ...packageInfo.package,
          version,
        };
        const manifestContent = await this.storage.getFile(
          packageContentPrefix(id) + ManifestSuffix,
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
        const description = BlockPackManifest.parse(
          JSON.parse(manifestContent.toString("utf8")),
        ).description;
        newVersions.push({
          description: addRelativePathPrefix(description, version),
          manifestSha256: sha256,
          channels,
        });

        // accumulate the kind-overview projection from this block's kind ref
        // (both inputs already in hand: parsed manifest + listed channels).
        if (description.kind) {
          const { name: kindNpmName, version: kindVersion } = parseKindRef(description.kind);
          const ovPath = kindOverviewPath(npmNameToKindPath(kindNpmName));
          const acc = touchedKinds.get(ovPath) ?? {
            touched: mode === "force" ? null : new Set<string>(),
            add: [],
          };
          acc.touched?.add(blockPackIdToString(id));
          acc.add.push({ id, kindVersion, channels });
          touchedKinds.set(ovPath, acc);
        }
      }

      // sorting entries according to version
      newVersions.sort((e1, e2) =>
        compareSemver(e2.description.id.version, e1.description.id.version),
      );

      // write package overview back
      const packageOverviewData = { schema: "v2", versions: newVersions } satisfies PackageOverview;
      if (mode !== "dry-run") {
        await this.storage.putFile(overviewFile, Buffer.from(JSON.stringify(packageOverviewData)));

        // Create snapshot after successful write
        await this.createPackageOverviewSnapshot(
          packageInfo.package,
          packageOverviewData,
          snapshotTimestamp,
        );
      }
      this.logger.info(`Done (${newVersions.length} records)`);

      // calculating all channels
      const allChannels = new Set<string>();
      for (const v of newVersions) for (const c of v.channels) allChannels.add(c);

      // patching corresponding entry in overview
      overviewPackages = overviewPackages.filter(
        (e) =>
          e.id.organization !== packageInfo.package.organization ||
          e.id.name !== packageInfo.package.name,
      );
      const packagePrefix = `${packageInfo.package.organization}/${packageInfo.package.name}`;
      overviewPackages.push({
        id: {
          organization: packageInfo.package.organization,
          name: packageInfo.package.name,
        },
        // left for backward compatibility
        allVersions: newVersions.map((e) => e.description.id.version).reverse(),
        allVersionsWithChannels: newVersions
          .map((e) => ({ version: e.description.id.version, channels: e.channels }))
          .reverse(),
        // left for backward compatibility
        latest: addRelativePathPrefix(newVersions[0].description, packagePrefix),
        // left for backward compatibility
        latestManifestSha256: newVersions[0].manifestSha256,
        latestByChannel: Object.fromEntries(
          [...allChannels, AnyChannel].map((c) => {
            // if c === 'any' the first element will be "found"
            const v = newVersions.find((v) => c === AnyChannel || v.channels.indexOf(c) !== -1);
            if (!v) throw new Error("Assertion error");
            return [
              c,
              {
                description: addRelativePathPrefix(v.description, packagePrefix),
                manifestSha256: v?.manifestSha256,
              },
            ];
          }),
        ),
      });
    }

    // projecting kind overviews (kinds/{org}/{name}/overview.json)
    for (const [ovPath, acc] of touchedKinds) {
      const current: KindOverview =
        acc.touched === null
          ? { schema: "v1", implementers: [], kindVersions: [] }
          : ((await this.getKindOverviewAt(ovPath)) ?? {
              schema: "v1",
              implementers: [],
              kindVersions: [],
            });

      // RMW: drop the (block id) entries re-read this pass, keep the rest; in
      // force mode `touched` is null and everything is rebuilt from the scan.
      const kept =
        acc.touched === null
          ? []
          : current.implementers.filter((e) => !acc.touched!.has(blockPackIdToString(e.id)));
      const merged = [...kept, ...acc.add];

      if (merged.length === 0) {
        if (mode !== "dry-run") await this.storage.deleteFiles(ovPath);
        this.logger.info(`Kind overview ${ovPath} orphaned — removed`);
        continue;
      }

      // bucket implementers by kind version, then compute the newest block per
      // channel (+ derived AnyChannel), mirroring the package latestByChannel.
      const byKindVersion = new Map<string, KindImplementer[]>();
      for (const impl of merged) {
        const bucket = byKindVersion.get(impl.kindVersion);
        if (bucket) bucket.push(impl);
        else byKindVersion.set(impl.kindVersion, [impl]);
      }

      const kindVersions: KindVersionOverview[] = [...byKindVersion.entries()]
        .map(([kindVersion, impls]) => {
          const allChannels = new Set<string>();
          for (const i of impls) for (const c of i.channels) allChannels.add(c);
          const latestByChannel = Object.fromEntries(
            [...allChannels, AnyChannel].map((c) => {
              const candidate = impls
                .filter((i) => c === AnyChannel || i.channels.indexOf(c) !== -1)
                .sort((a, b) => compareSemver(b.id.version, a.id.version))[0];
              if (!candidate) throw new Error("Assertion error");
              return [c, candidate.id];
            }),
          );
          return { kindVersion, latestByChannel };
        })
        .sort((e1, e2) => compareSemver(e2.kindVersion, e1.kindVersion));

      const overviewData = {
        schema: "v1",
        implementers: merged,
        kindVersions,
      } satisfies KindOverview;
      if (mode !== "dry-run")
        await this.storage.putFile(ovPath, Buffer.from(JSON.stringify(overviewData)));
      this.logger.info(
        `Kind overview ${ovPath} updated (${merged.length} implementers, ${kindVersions.length} kind versions)`,
      );
    }

    // writing global overview
    if (mode !== "dry-run") {
      const overviewData = JSON.stringify({
        schema: "v2",
        packages: overviewPackages,
      } satisfies GlobalOverviewReg);
      const overviewBuffer = Buffer.from(overviewData);

      // Write regular overview file
      await this.storage.putFile(GlobalOverviewPath, overviewBuffer);

      // Write gzipped overview file
      const gzippedBuffer = await this.gzipAsync(overviewData);
      await this.storage.putFile(GlobalOverviewGzPath, Buffer.from(gzippedBuffer));

      // Create snapshot after successful writes
      await this.createGlobalOverviewSnapshot(overviewData, snapshotTimestamp);
    }
    this.logger.info(`Global overview updated (${overviewPackages.length} records)`);

    // deleting seeds
    if (mode !== "dry-run")
      await this.storage.deleteFiles(...seedPaths.map((sp) => `${VersionUpdatesPrefix}${sp}`));
    this.logger.info(`Version update requests cleared`);
  }

  public async updateIfNeeded(mode: "force" | "normal" | "dry-run" = "normal"): Promise<void> {
    // implementation of main convergence algorithm

    this.logger.info(`Checking if registry requires refresh...`);
    const updateRequestSeed = await this.storage.getFile(GlobalUpdateSeedInFile);
    const currentUpdatedSeed = await this.storage.getFile(GlobalUpdateSeedOutFile);
    if (mode !== "force" && updateRequestSeed === undefined && currentUpdatedSeed === undefined) {
      this.logger.info(`No global seed files found, update not needed.`);
      return;
    }
    if (
      mode !== "force" &&
      updateRequestSeed !== undefined &&
      currentUpdatedSeed !== undefined &&
      updateRequestSeed.equals(currentUpdatedSeed)
    ) {
      this.logger.info(`Registry is up to date.`);
      return;
    }

    await this.updateRegistry(mode);

    if (updateRequestSeed) {
      if (mode !== "dry-run")
        await this.storage.putFile(GlobalUpdateSeedOutFile, updateRequestSeed);
      this.logger.info(`Refresh finished.`);
    }
  }

  public async getPackageOverview(
    name: BlockPackIdNoVersion,
  ): Promise<undefined | PackageOverview> {
    const content = await this.storage.getFile(packageOverviewPath(name));
    if (content === undefined) return undefined;
    return PackageOverview.parse(JSON.parse(content.toString()));
  }

  public async getGlobalOverview(): Promise<undefined | GlobalOverviewReg> {
    const content = await this.storage.getFile(GlobalOverviewPath);
    if (content === undefined) return undefined;
    return parseGlobalOverviewReg(JSON.parse(content.toString()));
  }

  /** Read+parse a kind overview by its absolute `kinds/{org}/{name}/overview.json` path. */
  private async getKindOverviewAt(path: string): Promise<KindOverview | undefined> {
    const content = await this.storage.getFile(path);
    if (content === undefined) return undefined;
    return KindOverview.parse(JSON.parse(content.toString()));
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

  public async listGlobalOverviewSnapshots(): Promise<GlobalOverviewBackupDescription[]> {
    const snapshotPaths = await this.storage.listFiles(GlobalSnapshotsPrefix);
    const snapshots: GlobalOverviewBackupDescription[] = [];

    for (const path of snapshotPaths) {
      // Extract filename from path
      const filename = path.indexOf("/") === -1 ? path : path.substring(path.lastIndexOf("/") + 1);

      const match = filename.match(GlobalOverviewSnapshotPattern);
      if (match) {
        snapshots.push({
          timestamp: match.groups!.timestamp,
          path: GlobalSnapshotsPrefix + filename,
        });
      }
    }

    // Sort by timestamp descending (newest first)
    snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return snapshots;
  }

  public async restoreGlobalOverviewFromSnapshot(backupId: string): Promise<void> {
    const snapshotPath = globalOverviewSnapshotPath(backupId);

    // Read and decompress the snapshot
    const snapshotData = await this.storage.getFile(snapshotPath);
    if (!snapshotData) {
      throw new Error(`Snapshot ${backupId} not found at ${snapshotPath}`);
    }

    const decompressedData = await this.gunzipAsync(snapshotData);
    const overviewData = decompressedData.toString("utf8");

    // Validate the data
    try {
      parseGlobalOverviewReg(JSON.parse(overviewData));
    } catch (error) {
      throw new Error(`Invalid snapshot data in ${backupId}: ${String(error)}`);
    }

    // Write both regular and gzipped versions
    const overviewBuffer = Buffer.from(overviewData);
    await this.storage.putFile(GlobalOverviewPath, overviewBuffer);

    const gzippedBuffer = await this.gzipAsync(overviewData);
    await this.storage.putFile(GlobalOverviewGzPath, Buffer.from(gzippedBuffer));

    this.logger.info(`Global overview restored from snapshot ${backupId}`);
  }

  public async publishPackage(
    manifest: BlockPackManifest,
    fileReader: RelativeContentReader,
  ): Promise<void> {
    const prefix = packageContentPrefix(manifest.description.id);
    // uploading content files
    for (const f of manifest.files) {
      const bytes = await fileReader(f.name);
      if (bytes.length !== f.size)
        throw new Error(
          `Actual file size don't match file size from the manifest file for ${f.name} (actual = ${bytes.length}; manifest = ${f.size})`,
        );
      const sha256 = await calculateSha256(bytes);
      if (sha256 !== f.sha256.toUpperCase())
        throw new Error(
          `Actual file SHA-256 don't match the checksum from the manifest file for ${f.name} (actual = ${sha256}; manifest = ${f.sha256.toUpperCase()})`,
        );

      const dst = prefix + "/" + f.name;
      this.logger.info(`Uploading ${f.name} -> ${dst} ...`);
      await this.storage.putFile(dst, bytes);
    }

    // uploading manifest as the last upload action
    const manifestDst = prefix + "/" + ManifestFileName;
    this.logger.info(`Uploading manifest to ${manifestDst} ...`);
    await this.storage.putFile(manifestDst, Buffer.from(JSON.stringify(manifest)));

    await this.marchChanged(manifest.description.id);
  }

  /**
   * Publish a block *kind* into the `kinds/` tree — idempotent, immutable,
   * content-first. Cloned from {@link publishPackage} with two differences:
   *
   *   1. NET-NEW source-hash guard: kind versions are immutable. If a manifest
   *      already exists with the same `sourceHash` this is a no-op; with a
   *      different `sourceHash` it hard-fails. (No such guard exists for
   *      blocks — `publishPackage` still overwrites same-version content.)
   *   2. NO `marchChanged`: the kind projection is derived from *block*
   *      manifests by the reconciler, so kind content publish drops no ticket —
   *      it rides the block's publish ticket. A kind with zero implementing
   *      blocks is deliberately invisible (no `overview.json`).
   *
   * The path is derived from the manifest's full npm package name
   * (`kind.name`) via `npmNameToKindPath` (inside `kindContentPrefix`) — the
   * SAME derivation the reconciler and readers use, so content and overview
   * always co-locate under one `{org}/{name}` folder. There is no separate
   * `organization` field on the identity.
   */
  public async publishKind(
    kindManifest: KindManifest,
    fileReader: RelativeContentReader,
  ): Promise<void> {
    const { name: npmName, version } = kindManifest.kind;
    const prefix = kindContentPrefix(npmName, version);

    // NET-NEW source-hash immutability guard (absent / equal / differ).
    const existing = await this.storage.getFile(`${prefix}/${KindManifestFileName}`);
    if (existing !== undefined) {
      const prev = KindManifest.parse(JSON.parse(existing.toString()));
      if (prev.sourceHash === kindManifest.sourceHash) {
        this.logger.info(
          `Kind ${npmName}@${version} already published with identical source — no-op`,
        );
        return; // idempotent
      }
      throw new Error(
        `Immutable kind version republished with different content: ${prefix} ` +
          `(stored sourceHash ${prev.sourceHash} != ${kindManifest.sourceHash})`,
      );
    }

    // content-first upload, per-file size + sha256 verify (mirrors publishPackage)
    for (const f of kindManifest.files) {
      const bytes = await fileReader(f.name);
      if (bytes.length !== f.size)
        throw new Error(
          `Actual file size don't match the manifest for ${f.name} (actual = ${bytes.length}; manifest = ${f.size})`,
        );
      const sha256 = await calculateSha256(bytes);
      if (sha256 !== f.sha256.toUpperCase())
        throw new Error(
          `Actual file SHA-256 don't match the manifest for ${f.name} (actual = ${sha256}; manifest = ${f.sha256.toUpperCase()})`,
        );

      const dst = `${prefix}/${f.name}`;
      this.logger.info(`Uploading ${f.name} -> ${dst} ...`);
      await this.storage.putFile(dst, bytes);
    }

    // manifest LAST = commit marker; stamp firstUploadTimestamp when absent.
    const toStore = KindManifest.parse({
      ...kindManifest,
      firstUploadTimestamp: kindManifest.firstUploadTimestamp ?? Date.now(),
    } satisfies KindManifest);
    const manifestDst = `${prefix}/${KindManifestFileName}`;
    this.logger.info(`Uploading kind manifest to ${manifestDst} ...`);
    await this.storage.putFile(manifestDst, Buffer.from(JSON.stringify(toStore)));

    // NO marchChanged — projection rides the block ticket (see doc §5).
  }
}
