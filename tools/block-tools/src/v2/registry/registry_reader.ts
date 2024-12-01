import {
  BlockPackId,
  BlockPackIdNoVersion,
  blockPackIdNoVersionEquals,
  BlockPackManifest,
  BlockPackMetaEmbeddedBytes,
  BlockPackMetaManifest,
  BlockPackOverview,
  SingleBlockPackOverview
} from '@milaboratories/pl-model-middle-layer';
import { FolderReader } from '../../io';
import canonicalize from 'canonicalize';
import {
  GlobalOverviewFileName,
  GlobalOverviewReg,
  MainPrefix,
  ManifestFileName,
  packageContentPrefixInsideV2,
  packageOverviewPathInsideV2
} from './schema_public';
import { BlockComponentsAbsoluteUrl, BlockPackMetaEmbedBytes } from '../model';
import { LRUCache } from 'lru-cache';
import { calculateSha256 } from '../../util';

export type BlockPackOverviewNoRegLabel = Omit<BlockPackOverview, 'registryId'>;
export type SingleBlockPackOverviewNoRegLabel = Omit<SingleBlockPackOverview, 'registryId'>;

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

  /**
   * Embeds meta infromation relative to registry root.
   * Meta information that looks like:
   *
   * */
  private readonly embeddedGlobalMetaCache = new LRUCache<
    string,
    BlockPackMetaEmbeddedBytes,
    { meta: BlockPackMetaManifest; relativeTo?: BlockPackId }
  >({
    max: 500,
    fetchMethod: async (_key, _staleValue, options) => {
      const contentReader =
        options.context.relativeTo !== undefined
          ? this.v2RootFolderReader
              .relativeReader(packageContentPrefixInsideV2(options.context.relativeTo))
              .getContentReader()
          : this.v2RootFolderReader.getContentReader();
      return await BlockPackMetaEmbedBytes(contentReader).parseAsync(options.context.meta);
    }
  });

  private async embedMetaContent(
    id: BlockPackId,
    sha256: string,
    absolutePath: boolean,
    meta: BlockPackMetaManifest
  ): Promise<BlockPackMetaEmbeddedBytes> {
    return await this.embeddedGlobalMetaCache.forceFetch(
      canonicalize({ id, sha256, absolutePath })!,
      { context: { meta, relativeTo: absolutePath ? undefined : id } }
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
      // const rootContentReader = this.v2RootFolderReader.getContentReader();
      const globalOverview = GlobalOverviewReg.parse(
        JSON.parse(
          Buffer.from(await this.v2RootFolderReader.readFile(GlobalOverviewFileName)).toString()
        )
      );

      const result = await Promise.all(
        globalOverview.packages.map(async (p) => {
          const byChannelEntries = await Promise.all(
            Object.entries(p.latestByChannel).map(async ([channel, data]) => [
              channel,
              {
                id: data.description.id,
                meta: await this.embedMetaContent(
                  p.latest.id,
                  p.latestManifestSha256,
                  true,
                  p.latest.meta
                ),
                spec: {
                  type: 'from-registry-v2',
                  id: p.latest.id,
                  registryUrl: this.registryReader.rootUrl.toString(),
                  channel
                }
              }
            ])
          );
          return {
            id: p.id,
            latestByChannel: Object.fromEntries(byChannelEntries),
            allVersions: p.allVersions
          } satisfies BlockPackOverviewNoRegLabel;
        })
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

  public async getLatestOverview(
    id: BlockPackIdNoVersion,
    channel: string
  ): Promise<SingleBlockPackOverviewNoRegLabel | undefined> {
    const overview = (await this.listBlockPacks()).find((e) =>
      blockPackIdNoVersionEquals(id, e.id)
    );
    if (overview === undefined) return undefined;
    return overview.latestByChannel[channel];
  }

  public async getSpecificOverview(id: BlockPackId): Promise<SingleBlockPackOverviewNoRegLabel> {
    const overviewContent = await this.v2RootFolderReader.readFile(packageOverviewPathInsideV2(id));
    const overview = BlockPackManifest.parse(JSON.parse(Buffer.from(overviewContent).toString()));
    return {
      id: id,
      meta: await this.embedMetaContent(
        id,
        await calculateSha256(overviewContent),
        false,
        overview.description.meta
      ),
      spec: {
        type: 'from-registry-v2',
        id,
        registryUrl: this.registryReader.rootUrl.toString()
      }
    };
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
