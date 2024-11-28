import * as sdk from '@milaboratories/pl-model-common';
import { Signer } from '@milaboratories/ts-helpers';
import { ImportFileHandleIndexData, ImportFileHandleUploadData } from '../types';

export function createIndexImportHandle(
  storageName: string,
  path: string
): sdk.ImportFileHandleIndex {
  const data: ImportFileHandleIndexData = {
    storageId: storageName,
    path: path
  };

  return `index://index/${encodeURIComponent(JSON.stringify(data))}`;
}

export function createUploadImportHandle(
  localPath: string,
  signer: Signer,
  sizeBytes: bigint,
  modificationTimeSeconds: bigint
): sdk.ImportFileHandleUpload {
  const data: ImportFileHandleUploadData = {
    localPath,
    pathSignature: signer.sign(localPath),
    sizeBytes: String(sizeBytes),
    modificationTime: String(modificationTimeSeconds)
  };

  return `upload://upload/${encodeURIComponent(JSON.stringify(data))}`;
}

export function parseUploadHandle(handle: sdk.ImportFileHandleUpload): ImportFileHandleUploadData {
  const url = new URL(handle);
  return ImportFileHandleUploadData.parse(
    JSON.parse(decodeURIComponent(url.pathname.substring(1)))
  );
}

export function parseIndexHandle(handle: sdk.ImportFileHandleIndex): ImportFileHandleIndexData {
  const url = new URL(handle);
  return ImportFileHandleIndexData.parse(JSON.parse(decodeURIComponent(url.pathname.substring(1))));
}
