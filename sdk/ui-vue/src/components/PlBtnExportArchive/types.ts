import type { ImportFileHandle, RemoteBlobHandleAndSize } from '@platforma-sdk/model';

export type FileExportEntry = {
  importHandle: ImportFileHandle;
  blobHandle: RemoteBlobHandleAndSize;
  fileName?: string;
};

export type ExportItem = {
  fileName: string;
  current: number;
  size: number;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  error?: unknown;
};

export type ExportsMap = Map<string, ExportItem>;
