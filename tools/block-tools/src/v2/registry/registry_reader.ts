import {
  BlockPackDescriptionManifest,
  BlockPackMetaEmbeddedBytes,
  BlockPackMetaManifest,
  BlockPackOverview
} from '@milaboratories/pl-model-middle-layer';
import { FolderReader } from '../../io';
import canonicalize from 'canonicalize';
import {
  GlobalOverview,
  GlobalOverviewEntryReg,
  GlobalOverviewFileName,
  GlobalOverviewReg,
  MainPrefix,
  ManifestFileName
} from './schema_public';
import { BlockPackMetaEmbedBytes } from '../model';

export type BlockPackOverviewNoRegLabel = Omit<BlockPackOverview, 'registryId'>;

export class RegistryV2Reader {
  private readonly metaCache = new Map<
    string,
    { sha256: string; meta: BlockPackMetaEmbeddedBytes }
  >();

  private readonly rootFolderReader: FolderReader;

  constructor(
    private readonly url: string,
    reader: FolderReader
  ) {
    this.rootFolderReader = reader.relativeReader(MainPrefix);
  }

  private async embedMetaContent(
    entry: GlobalOverviewEntryReg
  ): Promise<BlockPackMetaEmbeddedBytes> {
    const id = canonicalize(entry.id)!;
    const fromCache = this.metaCache.get(id);
    if (fromCache && fromCache.sha256 === entry.latestManifestSha256) return fromCache.meta;
    const rootContentReader = this.rootFolderReader.getContentReader();
    const meta = await BlockPackMetaEmbedBytes(rootContentReader).parseAsync(entry.latest.meta);
    this.metaCache.set(id, { sha256: entry.latestManifestSha256, meta });
    return meta;
  }

  public async listBlockPacks(): Promise<BlockPackOverviewNoRegLabel[]> {
    const rootContentReader = this.rootFolderReader.getContentReader();
    const globalOverview = GlobalOverviewReg.parse(
      JSON.parse(
        Buffer.from(await this.rootFolderReader.readFile(GlobalOverviewFileName)).toString()
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
              registryUrl: this.url
            },
            otherVersions: p.allVersions
          }) satisfies BlockPackOverviewNoRegLabel
      )
    );
  }
}
