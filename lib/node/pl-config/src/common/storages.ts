import upath from 'upath';
import fs from 'node:fs/promises';
import type { PlControllerDataMainStoragesSettings, PlControllerDataStoragesSettings } from './types';

/** Settings that are needed for config generation:
 * runner's working dir (usually this is "work" storage),
 * dirs that needs to be created (Pl Backend couldn't do it itself at the moment),
 * storages configs and a path to the main storage (minio could use it). */
export interface StoragesSettings {
  runner: string;
  dirsToCreate: string[];
  storages: StorageSettings[];
  mainStoragePath: string;
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

export function newRemoteConfigStoragesFS(
  workdir: string,
  localHTTPPort?: number,
): StoragesSettings {
  const workPath = upath.join(workdir, 'storages', 'work');
  const mainPath = upath.join(workdir, 'storages', 'main');

  if (!localHTTPPort) {
    throw new Error('httpPort is required for remote FS storage config generation');
  }

  const main: StorageSettings = {
    main: {
      mode: 'primary',
      downloadable: true,
    },
    storage: {
      id: 'main',
      type: 'FS',
      indexCachePeriod: '0s',
      rootPath: mainPath,
      externalURL: `http://localhost:${localHTTPPort}`,
      allowRemoteAccess: true,
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
    dirsToCreate: [workPath, mainPath],
    storages: [remoteRoot, work, main],
    mainStoragePath: mainPath,
  };
}

export function newRemoteConfigStoragesMinio(
  workdir: string,
  minioOpts: RemoteMinioSettings,
): StoragesSettings {
  const workPath = upath.join(workdir, 'storages', 'work');
  const mainPath = upath.join(workdir, 'storages', 'main');

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
      key: `static:${minioOpts.key}`,
      secret: `static:${minioOpts.secret}`,
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
      allowRemoteAccess: false,
      externalURL: '',
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
      allowRemoteAccess: false,
      externalURL: '',
    },
  };

  return {
    runner: workPath,
    dirsToCreate: [workPath, mainPath],
    storages: [remoteRoot, work, main],
    mainStoragePath: mainPath,
  };
}

export async function createDefaultLocalStorages(workdir: string, externalURL: string): Promise<StoragesSettings> {
  const storages = newDefaultLocalStorages(workdir, externalURL);

  for (const d of storages.dirsToCreate) {
    await fs.mkdir(d, { recursive: true });
  }

  return storages;
}

function newDefaultLocalStorages(workdir: string, externalURL: string): StoragesSettings {
  const workPath = upath.join(workdir, 'storages', 'work');
  const mainPath = upath.join(workdir, 'storages', 'main');

  // root storage will be ignored in a local pl deployments in the driver
  // (Platforma needs to be able to upload any file by absolute paths
  // in the local deployment, that's why it exists.)
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
      allowRemoteAccess: false,
      externalURL: '',
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
      allowRemoteAccess: false, // should launch a http-server but leave upload / download URL with 'storage://' prefix
      externalURL: externalURL,
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
      allowRemoteAccess: false,
      externalURL: '',
    },
  };

  return {
    runner: workPath,
    dirsToCreate: [workPath, mainPath],
    storages: [root, work, main],
    mainStoragePath: mainPath,
  };
}
