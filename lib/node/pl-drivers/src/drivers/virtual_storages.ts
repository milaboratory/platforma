import path from 'path';
import os from 'os';
import util from 'util';
import {exec} from 'child_process'
import { VirtualLocalStorageSpec } from './types';
import drivelist from 'drivelist';

export async function DefaultVirtualLocalStorages(): Promise<VirtualLocalStorageSpec[]> {
  const home = os.homedir();
  if (path.sep == '/')
    return [{ name: 'local', root: '/', initialPath: home }];

  const homeRoot = path.parse(home).root; // e.g. C:\
  const homeDrive = homeRoot.replaceAll(':\\', ''); // e.g. C drive.
  const drivePaths = parseWindowsDrives(await drivelist.list())

  return windowsDrivesToStorages(drivePaths, homeDrive, home);
}

export function parseWindowsDrives(drives: drivelist.Drive[]): string[] {
  return drives.flatMap(d => d.mountpoints.map(m => m.path.replaceAll(':', '')));
}

export function windowsDrivesToStorages(drives: string[], homeDrive: string, home: string) {
  return drives.map(d => ({
    name: `local_disk_${d}`,
    root: `${d}:\\`,
    initialPath: d == homeDrive ? home : `${d}:\\`,
  }));
}
