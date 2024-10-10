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
  mlPath: string;
}

export async function createDefaultLocalStorages(dir: string): Promise<StoragesSettings> {
  const rootPath = getRootDir();
  const workPath = path.join('storages', 'work');
  const mainPath = path.join('storages', 'main');

  await fs.mkdir(path.join(dir, mainPath), { recursive: true });
  await fs.mkdir(path.join(dir, workPath), { recursive: true });

  return getDefaultConfigStorages(rootPath, workPath, mainPath);
}

function getDefaultConfigStorages(
  rootPath: string,
  workPath: string,
  mainPath: string
): StoragesSettings {
  const root: StorageSettings = {
    mlPath: rootPath,
    main: {
      mode: 'passive',
      downloadable: true
    },
    storage: {
      id: 'root',
      type: 'FS',
      indexCachePeriod: '1m',
      rootPath: rootPath
    }
  };

  const main: StorageSettings = {
    mlPath: mainPath,
    main: {
      mode: 'primary',
      downloadable: true
    },
    storage: {
      id: 'main',
      type: 'FS',
      indexCachePeriod: '1m',
      rootPath: mainPath
    }
  };

  const work: StorageSettings = {
    mlPath: workPath,
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
    storages: [root, work, main],
  };
}

export function storagesToMl(settings: StoragesSettings): Record<string, string> {
  return Object.fromEntries(settings.storages
    .filter(s => s.main.downloadable)
    .map(s => [s.storage.id, s.mlPath]));
}

export function getRootDir() {
  return path.parse(process.cwd()).root;
}
