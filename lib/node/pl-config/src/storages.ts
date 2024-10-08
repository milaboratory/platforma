import path from 'path';
import fs from 'fs/promises';
import { PlControllerDataMainStoragesSettings, PlControllerDataStoragesSettings } from './types';

export interface StoragesSettings {
  runner: string;
  storages: StorageSettings[];
  root: string;
}

export interface StorageSettings {
  storage: PlControllerDataStoragesSettings;
  main: PlControllerDataMainStoragesSettings;
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
    root: rootPath
  };
}

export function getRootDir() {
  return path.parse(process.cwd()).root;
}
