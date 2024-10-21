import path from 'path';
import os from 'os';
import util from 'util';
import { exec } from 'child_process'
import { VirtualLocalStorageSpec } from './types';

export async function DefaultVirtualLocalStorages(): Promise<VirtualLocalStorageSpec[]> {
  const home = os.homedir();
  if (path.sep == '/')
    return [{
      name: 'local',
      root: '/',
      initialPath: home,
      isInitialPathHome: true
    }];

  const homeRoot = path.parse(home).root; // e.g. C:\
  const homeDrive = homeRoot.replaceAll(':\\', ''); // e.g. C drive.
  const wmic = await util.promisify(exec)('wmic logicaldisk get name');
  const drives = windowsDrives(wmic.stdout);

  return windowsStorages(drives, homeDrive, home);
}

export function windowsDrives(wmicStdout: string): string[] {
  return wmicStdout.split('\r\n')
    .filter(line => line.includes(':'))
    .map(line => line.trim().replaceAll(':', ''));
}

export function windowsStorages(drives: string[], homeDrive: string, home: string) {
  return drives.map(d => {
    const isInitialPathHome = d == homeDrive;
    return {
      name: `local_disk_${d}`,
      root: `${d}:\\`,
      initialPath: isInitialPathHome ? home : `${d}:\\`,
      isInitialPathHome
    }
  });
}
