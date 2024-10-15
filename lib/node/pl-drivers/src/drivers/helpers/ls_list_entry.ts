import { MiLogger, notEmpty, Signer } from '@milaboratories/ts-helpers';
import * as sdk from '@milaboratories/pl-model-common';
import { Timestamp } from '../../proto/google/protobuf/timestamp';
import { Dirent, Stats } from 'node:fs';
import { z } from 'zod';
import { ImportFileHandleIndexData, ImportFileHandleUploadData } from '../types';

/** A duck-typing interface for grpc results. */
export interface ListResponse {
  items: ListItem[];
  delimiter: string;
}

export interface ListItem {
  isDir: boolean;
  name: string;
  fullName: string;
  lastModified?: Timestamp;
  size: bigint;
  directory: string;
}

// export function toLsEntries(info: {
//   storageName: string;
//   list: ListResponse;
//   signer: Signer;
//   remote: boolean;
// }): sdk.ListFilesResult {
//   const parent = info.list.items.length > 0 ? info.list.items[0]?.directory : undefined;
//
//   return {
//     parent: parent,
//     entries: info.list.items.map((item) => toLsEntry(item, info))
//   };
// }

// function toLsEntry(
//   item: ListItem,
//   info: {
//     storageName: string;
//     list: ListResponse;
//     signer: Signer;
//     remote: boolean;
//   }
// ): sdk.LsEntry {
//   if (item.isDir)
//     return {
//       type: 'dir',
//       name: item.name,
//       fullPath: item.fullName
//     };
//
//   return {
//     type: 'file',
//     name: item.name,
//     fullPath: item.fullName,
//     handle: toFileHandle({ item: item, ...info })
//   };
// }
//
// export function toFileHandle(info: {
//   storageName: string;
//   item: ListItem;
//   signer: Signer;
//   remote: boolean;
// }): sdk.ImportFileHandle {
//   if (info.remote) {
//     return createIndexImportHandle(info.storageName, info.item.fullName);
//   }
//
//   return createUploadImportHandle(
//     info.item.fullName,
//     info.signer,
//     info.item.size,
//     notEmpty(info.item.lastModified).seconds
//   );
// }

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

export function toListItem(
  logger: MiLogger,
  info: {
    directory: string;
    fullName: string;
    dirent: Dirent;
    stat: Stats;
  }
): ListItem | undefined {
  if (!(info.dirent.isFile() || info.dirent.isDirectory())) {
    logger.warn(`tried to get non-dir and non-file ${info.dirent.name}, skip it`);
    return;
  }

  return {
    directory: info.directory,
    isDir: info.dirent.isDirectory(),
    name: info.dirent.name,
    fullName: info.fullName,
    lastModified: {
      seconds: BigInt(Math.floor(info.stat.mtimeMs / 1000)),
      nanos: 0
    },
    size: BigInt(info.stat.size)
  };
}
