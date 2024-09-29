import {
  BlockPackId,
  BlockPackManifest,
  BlockPackMetaEmbeddedBytes,
  BlockPackOverview
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

export type BlockPackOverviewNoRegLabel = Omit<BlockPackOverview, 'registryId'>;

export class RegistryV2Reader {
  private readonly metaCache = new Map<
    string,
    { sha256: string; meta: BlockPackMetaEmbeddedBytes }
  >();

  private readonly v2RootFolderReader: FolderReader;

  constructor(private readonly registryReader: FolderReader) {
    this.v2RootFolderReader = registryReader.relativeReader(MainPrefix);
  }

  private async embedMetaContent(
    entry: GlobalOverviewEntryReg
  ): Promise<BlockPackMetaEmbeddedBytes> {
    const id = canonicalize(entry.id)!;
    const fromCache = this.metaCache.get(id);
    if (fromCache && fromCache.sha256 === entry.latestManifestSha256) return fromCache.meta;
    const rootContentReader = this.v2RootFolderReader.getContentReader();
    const meta = await BlockPackMetaEmbedBytes(rootContentReader).parseAsync(entry.latest.meta);
    this.metaCache.set(id, { sha256: entry.latestManifestSha256, meta });
    return meta;
  }

  public async listBlockPacks(): Promise<BlockPackOverviewNoRegLabel[]> {
    const rootContentReader = this.v2RootFolderReader.getContentReader();
    const globalOverview = GlobalOverviewReg.parse(
      JSON.parse(
        Buffer.from(await this.v2RootFolderReader.readFile(GlobalOverviewFileName)).toString()
      )
    );
    return await Promise.all(
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
  }

  public async getComponents(id: BlockPackId): Promise<BlockComponentsAbsoluteUrl> {
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
}
