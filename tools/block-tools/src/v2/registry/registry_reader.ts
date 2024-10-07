import {
  BlockPackId,
  BlockPackIdNoVersion,
  blockPackIdNoVersionEquals,
  BlockPackManifest,
  BlockPackMetaEmbeddedBytes,
  BlockPackOverview,
  BlockPackSpec
} from '@milaboratories/pl-model-middle-layer';
import { FolderReader } from '../../io';
import canonicalize from 'canonicalize';
import {
  GlobalOverviewEntryReg,
  GlobalOverviewFileName,
  GlobalOverviewReg,
  MainPrefix,
  ManifestFileName,
  packageContentPrefix,
  packageContentPrefixInsideV2
} from './schema_public';
import { BlockComponentsAbsoluteUrl, BlockPackMetaEmbedBytes } from '../model';
import { LRUCache } from 'lru-cache';

export type BlockPackOverviewNoRegLabel = Omit<BlockPackOverview, 'registryId'>;

export type RegistryV2ReaderOps = {
  /** Number of milliseconds to cache retrieved block list for */
  cacheBlockListFor: number;
  /** Number of milliseconds to keep cached retrieved block list for, if new requests returns error */
  keepStaleBlockListFor: number;
};

const DefaultRegistryV2ReaderOps: RegistryV2ReaderOps = {
  cacheBlockListFor: 45e3, // 45 seconds
  keepStaleBlockListFor: 300e3 // 5 minutes
};

export class RegistryV2Reader {
  private readonly v2RootFolderReader: FolderReader;
  private readonly ops: RegistryV2ReaderOps;

  constructor(
    private readonly registryReader: FolderReader,
    ops?: Partial<RegistryV2ReaderOps>
  ) {
    this.v2RootFolderReader = registryReader.relativeReader(MainPrefix);
    this.ops = { ...DefaultRegistryV2ReaderOps, ...(ops ?? {}) };
  }

  private readonly embeddedMetaCache = new LRUCache<
    string,
    BlockPackMetaEmbeddedBytes,
    GlobalOverviewEntryReg
  >({
    max: 500,
    fetchMethod: async (key, staleValue, options) => {
      const rootContentReader = this.v2RootFolderReader.getContentReader();
      const meta = await BlockPackMetaEmbedBytes(rootContentReader).parseAsync(
        options.context.latest.meta
      );
      return meta;
    }
  });

  private async embedMetaContent(
    entry: GlobalOverviewEntryReg
  ): Promise<BlockPackMetaEmbeddedBytes> {
    return await this.embeddedMetaCache.forceFetch(
      canonicalize({ id: entry.id, sha256: entry.latestManifestSha256 })!,
      { context: entry }
    );
  }

  private listCacheTimestamp: number = 0;
  private listCache: BlockPackOverviewNoRegLabel[] | undefined = undefined;

  public async listBlockPacks(): Promise<BlockPackOverviewNoRegLabel[]> {
    if (
      this.listCache !== undefined &&
      Date.now() - this.listCacheTimestamp <= this.ops.cacheBlockListFor
    )
      return this.listCache;
    try {
      const rootContentReader = this.v2RootFolderReader.getContentReader();

      const globalOverview = GlobalOverviewReg.parse(
        JSON.parse(
          Buffer.from(await this.v2RootFolderReader.readFile(GlobalOverviewFileName)).toString()
        )
      );

      const result = await Promise.all(
        globalOverview.packages.map(
          async (p) =>
            ({
              id: p.latest.id,
              meta: await this.embedMetaContent(p),
              spec: {
                type: 'from-registry-v2',
                id: p.latest.id,
                registryUrl: this.registryReader.rootUrl.toString()
              },
              otherVersions: p.allVersions
            }) satisfies BlockPackOverviewNoRegLabel
        )
      );

      this.listCache = result;
      this.listCacheTimestamp = Date.now();

      return result;
    } catch (e: unknown) {
      if (
        this.listCache !== undefined &&
        Date.now() - this.listCacheTimestamp <= this.ops.keepStaleBlockListFor
      )
        return this.listCache;
      throw e;
    }
  }

  public async getOverviewForSpec(
    id: BlockPackIdNoVersion
  ): Promise<BlockPackOverviewNoRegLabel | undefined> {
    return (await this.listBlockPacks()).find((e) => blockPackIdNoVersionEquals(id, e.id));
  }

  private readonly componentsCache = new LRUCache<string, BlockComponentsAbsoluteUrl, BlockPackId>({
    max: 500,
    fetchMethod: async (key, staleValue, { context: id }) => {
      const packageFolderReader = this.v2RootFolderReader.relativeReader(
        packageContentPrefixInsideV2(id)
      );
      const manifest = BlockPackManifest.parse(
        JSON.parse(Buffer.from(await packageFolderReader.readFile(ManifestFileName)).toString())
      );
      return BlockComponentsAbsoluteUrl(packageFolderReader.rootUrl.toString()).parse(
        manifest.description.components
      );
    }
  });

  public async getComponents(id: BlockPackId): Promise<BlockComponentsAbsoluteUrl> {
    return await this.componentsCache.forceFetch(canonicalize(id)!, { context: id });
  }
}
