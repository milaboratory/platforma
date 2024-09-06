import type { GridApi, GridOptions } from '@ag-grid-community/core';
import type { BlobDriver, LocalBlobHandleAndSize, RemoteBlobHandleAndSize } from '@milaboratory/sdk-ui';

export async function xsvGridOptions(
  blobDriver: BlobDriver,
  file: LocalBlobHandleAndSize | RemoteBlobHandleAndSize,
  gridApi: GridApi | undefined,
): Promise<GridOptions> {
  blobDriver;
  file;
  gridApi;
  //blobDriver.getContent(file.handle!)
  // return {
  //   datasource,
  //   columnDefs,
  //   maxBlocksInCache: 10000,
  //   cacheBlockSize: 100,
  //   rowModelType: "infinite",
  // };

  throw Error('not implemented');
}
