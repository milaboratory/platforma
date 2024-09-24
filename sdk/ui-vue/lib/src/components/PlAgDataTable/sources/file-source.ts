import type { ColDef, GridApi, IDatasource } from '@ag-grid-community/core';
import type { BlobDriver, LocalBlobHandleAndSize, RemoteBlobHandleAndSize } from '@milaboratory/sdk-ui';

export async function updateXsvGridOptions(
  gridApi: GridApi,
  blobDriver: BlobDriver,
  file: LocalBlobHandleAndSize | RemoteBlobHandleAndSize,
): Promise<{
  columnDefs: ColDef[];
  datasource: IDatasource;
}> {
  gridApi;
  blobDriver;
  file;
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
