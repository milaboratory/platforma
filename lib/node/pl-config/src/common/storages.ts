import path from 'path';
import fs from 'fs/promises';
import type { PlControllerDataMainStoragesSettings, PlControllerDataStoragesSettings } from './types';

export interface StoragesSettings {
  runner: string;
  dirsToCreate: string[];
  storages: StorageSettings[];
}

export interface StorageSettings {
  storage: PlControllerDataStoragesSettings;
  main: PlControllerDataMainStoragesSettings;

  /** Via this path storage is available for the local observer (like middle-layer in desktop app) */
  localPath?: string;
}

export interface RemoteMinioSettings {
  endpoint: string;
  presignEndpoint: string;

  key: string;
  secret: string;

  bucketName: string;
}

export function getRemoteConfigStorages(
  workdir: string,
  minioOpts: RemoteMinioSettings,
): StoragesSettings {
  const workPath = path.join(workdir, 'storages', 'work');

  const main: StorageSettings = {
    main: {
      mode: 'primary',
      downloadable: true,
    },
    storage: {
      id: 'main',
      type: 'S3',
      indexCachePeriod: '0s',
      endpoint: minioOpts.endpoint,
      region: '',
      presignEndpoint: minioOpts.presignEndpoint,
      bucketName: minioOpts.bucketName,
      createBucket: true,
      forcePathStyle: true,
      key: minioOpts.key,
      secret: minioOpts.secret,
      keyPrefix: '',
      accessPrefixes: [''],
      uploadKeyPrefix: '',
    },
  };

  const remoteRoot: StorageSettings = {
    localPath: '',
    main: {
      mode: 'passive',
      downloadable: true,
    },
    storage: {
      id: 'remoteRoot',
      type: 'FS',
      indexCachePeriod: '1m',
      rootPath: '',
    },
  };

  const work: StorageSettings = {
    main: {
      mode: 'active',
      downloadable: false,
    },
    storage: {
      id: 'work',
      type: 'FS',
      indexCachePeriod: '1m',
      rootPath: workPath,
    },
  };

  return {
    runner: workPath,
    dirsToCreate: [],
    storages: [remoteRoot, work, main],
  };
}

export async function createDefaultLocalStorages(workdir: string): Promise<StoragesSettings> {
  const storages = getDefaultLocalStorages(workdir);

  for (const d of storages.dirsToCreate) {
    await fs.mkdir(d, { recursive: true });
  }

  return storages;
}

export function getDefaultLocalStorages(workdir: string): StoragesSettings {
  const workPath = path.join(workdir, 'storages', 'work');
  const mainPath = path.join(workdir, 'storages', 'main');

  const root: StorageSettings = {
    localPath: '',
    main: {
      mode: 'passive',
      downloadable: true,
    },
    storage: {
      id: 'root',
      type: 'FS',
      indexCachePeriod: '1m',
      rootPath: '',
    },
  };

  const main: StorageSettings = {
    localPath: mainPath,
    main: {
      mode: 'primary',
      downloadable: true,
    },
    storage: {
      id: 'main',
      type: 'FS',
      indexCachePeriod: '0m',
      rootPath: mainPath,
    },
  };

  const work: StorageSettings = {
    main: {
      mode: 'active',
      downloadable: false,
    },
    storage: {
      id: 'work',
      type: 'FS',
      indexCachePeriod: '1m',
      rootPath: workPath,
    },
  };

  return {
    runner: workPath,
    dirsToCreate: [workPath, mainPath],
    storages: [root, work, main],
  };
}
