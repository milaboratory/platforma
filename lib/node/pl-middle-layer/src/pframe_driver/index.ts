import { DownloadDriver } from '@milaboratory/pl-drivers';
import type PFramesType from '@milaboratory/pframes-node';
import { PFrameInternal } from '@milaboratory/pl-middle-layer-model';
import { ResourceInfo } from '@milaboratory/pl-tree';
import { ComputableStableDefined } from '@milaboratory/computable';
import { LocalBlobHandleAndSize } from '@milaboratory/sdk-ui';
import { RefCountResourcePool } from './ref_count_pool';
import { PColumnData, allBlobs, mapBlobs } from './data';
import { createHash } from 'crypto';

// special way of importing native node module
const PFrames: PFramesType = require('@milaboratory/pframes-node');

function blobKey(res: ResourceInfo): string {
  return String(res.id);
}

function idFromData(data: Map<string, PColumnData>) {
  const hash = createHash('sha256');
  hash.update()
}

class PFrameHolder implements PFrameInternal.PFrameDataSource, Disposable {
  public readonly pframe: PFrameInternal.PFrame = new PFrames.PFrame();
  private readonly blobIdToResource = new Map<string, ResourceInfo>();
  private readonly blobHandleComputables = new Map<
    string,
    ComputableStableDefined<LocalBlobHandleAndSize>
  >();

  constructor(
    private readonly id: string,
    private readonly blobDriver: DownloadDriver,
    private readonly data: Map<string, PColumnData>
  ) {
    // pframe initialization
    this.pframe.setDataSource(this);
    for (const [columnId, columnData] of data) {
      this.pframe.addColumnSpec(columnId, columnData.spec);
      for (const blob of allBlobs(columnData.data)) this.blobIdToResource.set(blobKey(blob), blob);
      this.pframe.setColumnData(columnId, mapBlobs(columnData.data, blobKey));
    }
  }

  private getOrCreateComputableForBlob(blobId: string) {
    let computable = this.blobHandleComputables.get(blobId);
    if (computable !== undefined) return computable;

    const blobResource = this.blobIdToResource.get(blobId);
    if (blobResource === undefined) throw new Error(`Blob with id ${blobId} not found.`);

    // precalculation of value tree will trigger the download proecess right away
    computable = this.blobDriver.getDownloadedBlob(blobResource).withPreCalculatedValueTree();

    this.blobHandleComputables.set(blobId, computable);

    return computable;
  }

  public async preloadBlob(blobIds: string[]): Promise<void> {
    const computables = blobIds.map((blobId) => this.getOrCreateComputableForBlob(blobId));
    for (const computable of computables) await computable.awaitStableFullValue();
  }

  public async resolveBlob(blobId: string): Promise<string> {
    const computable = this.getOrCreateComputableForBlob(blobId);
    return this.blobDriver.getLocalPath((await computable.awaitStableValue()).handle);
  }

  [Symbol.dispose](): void {
    for (const computable of this.blobHandleComputables.values()) computable.resetState();
    this.pframe.dispose();
  }
}

export class PFrameDriver {
  constructor(private readonly blobDriver: DownloadDriver) {}

  holders = new (class extends RefCountResourcePool<> {})();
}
