import { DownloadDriver } from '@milaboratory/pl-drivers';
import type PFramesType from '@milaboratory/pframes-node';
import { PFrameInternal } from '@milaboratory/pl-middle-layer-model';
import { ResourceInfo } from '@milaboratory/pl-tree';
import { ComputableStableDefined } from '@milaboratory/computable';
import {
  CalculateTableDataRequest,
  CalculateTableDataResponse,
  FindColumnsRequest,
  FindColumnsResponse,
  LocalBlobHandleAndSize,
  PColumnIdAndSpec,
  PColumnSpec,
  PFrameHandle,
  PObjectId,
  PTableColumnSpec,
  PTableHandle,
  PTableShape,
  PTableVector,
  TableRange,
  UniqueValuesRequest,
  UniqueValuesResponse,
  PFrameDriver as SdkPFrameDriver
} from '@milaboratory/sdk-ui';
import { RefCountResourcePool } from './ref_count_pool';
import { PColumn, PFrameData, allBlobs, mapBlobs, stableKeyFromPFrameData } from './data';
import { createHash } from 'crypto';

// special way of importing native node module
const PFrames: PFramesType = require('@milaboratory/pframes-node');

function blobKey(res: ResourceInfo): string {
  return String(res.id);
}

class PFrameHolder implements PFrameInternal.PFrameDataSource, Disposable {
  public readonly pframe: PFrameInternal.PFrame = new PFrames.PFrame();
  private readonly blobIdToResource = new Map<string, ResourceInfo>();
  private readonly blobHandleComputables = new Map<
    string,
    ComputableStableDefined<LocalBlobHandleAndSize>
  >();

  constructor(
    private readonly blobDriver: DownloadDriver,
    private readonly data: Map<PObjectId, PColumn>
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

export class PFrameDriver implements SdkPFrameDriver {
  private readonly pFrames: RefCountResourcePool<PFrameData, PFrameHolder>;
  constructor(private readonly blobDriver: DownloadDriver) {
    this.pFrames = new (class extends RefCountResourcePool<PFrameData, PFrameHolder> {
      constructor(private readonly blobDriver: DownloadDriver) {
        super();
      }
      protected createNewResource(params: PFrameData): PFrameHolder {
        return new PFrameHolder(this.blobDriver, params);
      }
      protected calculateParamsKey(params: PFrameData): string {
        return stableKeyFromPFrameData(params);
      }
    })(this.blobDriver);
  }

  public createPFRame() {}

  findColumns(handle: PFrameHandle, request: FindColumnsRequest): Promise<FindColumnsResponse> {
    throw new Error('Method not implemented.');
  }

  getColumnSpec(handle: PFrameHandle, columnId: PObjectId): Promise<PColumnSpec> {
    throw new Error('Method not implemented.');
  }

  listColumns(handle: PFrameHandle): Promise<PColumnIdAndSpec[]> {
    throw new Error('Method not implemented.');
  }

  calculateTableData(
    handle: PFrameHandle,
    request: CalculateTableDataRequest<PObjectId>
  ): Promise<CalculateTableDataResponse> {
    throw new Error('Method not implemented.');
  }

  getUniqueValues(
    handle: PFrameHandle,
    request: UniqueValuesRequest
  ): Promise<UniqueValuesResponse> {
    throw new Error('Method not implemented.');
  }

  getShape(handle: PTableHandle): PTableShape {
    throw new Error('Method not implemented.');
  }

  getSpec(handle: PTableHandle): PTableColumnSpec[] {
    throw new Error('Method not implemented.');
  }

  getData(
    handle: PTableHandle,
    columnIndices: number[],
    range?: TableRange | undefined
  ): Promise<PTableVector[]> {
    throw new Error('Method not implemented.');
  }
}
