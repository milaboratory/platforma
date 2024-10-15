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
  localPath: string;
}

export async function createDefaultLocalStorages(workdir: string): Promise<StoragesSettings> {
  const rootPath = getRootDir();
  const workPath = path.join(workdir, 'storages', 'work');
  const mainPath = path.join(workdir, 'storages', 'main');

  await fs.mkdir(workPath, { recursive: true });
  await fs.mkdir(mainPath, { recursive: true });

  return getDefaultConfigStorages(rootPath, workPath, mainPath);
}

function getDefaultConfigStorages(
  rootPath: string,
  workPath: string,
  mainPath: string
): StoragesSettings {
  const root: StorageSettings = {
    localPath: rootPath,
    main: {
      mode: 'passive',
      downloadable: true
    },
    storage: {
      id: 'root',
      type: 'FS',
      indexCachePeriod: '1m',
      rootPath: ""
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
    localPath: mainPath,
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

export function storagesToMl(settings: StoragesSettings): Record<string, string> {
  return Object.fromEntries(
    settings.storages.filter((s) => s.main.downloadable).map((s) => [s.storage.id, s.localPath])
  );
}

export function getRootDir() {
  return path.parse(process.cwd()).root;
}
