import type { ColDef, IDatasource } from '@ag-grid-community/core';
import type { BlobDriver, LocalBlobHandleAndSize, RemoteBlobHandleAndSize } from '@platforma-sdk/model';

export async function updateXsvGridOptions(
  _blobDriver: BlobDriver,
  _file: LocalBlobHandleAndSize | RemoteBlobHandleAndSize,
): Promise<{
    columnDefs: ColDef[];
    datasource: IDatasource;
  }> {
  // blobDriver;
  // file;
  // blobDriver.getContent(file.handle!)
  // return {
  //   datasource,
  //   columnDefs,
  //   maxBlocksInCache: 10000,
  //   cacheBlockSize: 100,
  //   rowModelType: "infinite",
  // };

  throw Error('not implemented');
}
