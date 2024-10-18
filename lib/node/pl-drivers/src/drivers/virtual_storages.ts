import path from 'path';
import os from 'os';
import util from 'util';
import {exec} from 'child_process'
import { VirtualLocalStorageSpec } from './types';

export async function DefaultVirtualLocalStorages(): Promise<VirtualLocalStorageSpec[]> {
  const home = os.homedir();
  if (path.sep == '/')
    return [{ name: 'local', root: '/', initialPath: home }];

  const homeRoot = path.parse(home).root; // e.g. C:\
  const homeDrive = homeRoot.replaceAll(':\\', ''); // e.g. C drive.
  const wmic = await util.promisify(exec)('wmic logicaldisk get name');
  const drives = parseWindowsDrives(wmic.stdout);

  return windowsDrivesToStorages(drives, homeDrive, home);
}

export function parseWindowsDrives(wmicStdout: string): string[] {
  return wmicStdout.split('\r\n')
    .filter(line => line.includes(':'))
    .map(line => line.trim().replaceAll(':', ''));
}

export function windowsDrivesToStorages(drives: string[], homeDrive: string, home: string) {
  return drives.map(d => ({
    name: `local_disk_${d}`,
    root: `${d}:\\`,
    initialPath: d == homeDrive ? home : `${d}:\\`,
  }));
}
