import path from 'path';
import fs from 'fs/promises';
import { PlControllerDataMainStoragesSettings, PlControllerDataStoragesSettings } from './types';

export interface StoragesSettings {
  runner: string;
  storages: StorageSettings[];
}

export interface StorageSettings {
  storage: PlControllerDataStoragesSettings;
  main: PlControllerDataMainStoragesSettings;

  /** Via this path storage is available for the local observer (like middle-layer in desktop app) */
  localPath?: string;
}

export async function createDefaultLocalStorages(workdir: string): Promise<StoragesSettings> {
  const workPath = path.join(workdir, 'storages', 'work');
  const mainPath = path.join(workdir, 'storages', 'main');

  await fs.mkdir(workPath, { recursive: true });
  await fs.mkdir(mainPath, { recursive: true });

  return getDefaultConfigStorages(workPath, mainPath);
}

function getDefaultConfigStorages(workPath: string, mainPath: string): StoragesSettings {
  const root: StorageSettings = {
    localPath: '',
    main: {
      mode: 'passive',
      downloadable: true
    },
    storage: {
      id: 'root',
      type: 'FS',
      indexCachePeriod: '1m',
      rootPath: ''
    }
  };

  const main: StorageSettings = {
    localPath: mainPath,
    main: {
      mode: 'primary',
      downloadable: true
    },
    storage: {
      id: 'main',
      type: 'FS',
      indexCachePeriod: '0m',
      rootPath: mainPath
    }
  };

  const work: StorageSettings = {
    main: {
      mode: 'active',
      downloadable: false
    },
    storage: {
      id: 'work',
      type: 'FS',
      indexCachePeriod: '1m',
      rootPath: workPath
    }
  };

  return {
    runner: workPath,
    storages: [root, work, main]
  };
}
