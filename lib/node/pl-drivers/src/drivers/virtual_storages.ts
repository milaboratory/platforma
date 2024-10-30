import path from 'path';
import os from 'os';
import util from 'util';
import { exec } from 'child_process';
import { VirtualLocalStorageSpec } from './types';

export async function DefaultVirtualLocalStorages(): Promise<VirtualLocalStorageSpec[]> {
  const home = os.homedir();
  if (path.sep == '/')
    return [
      {
        name: 'local',
        root: '/',
        initialPath: home
      }
    ];
  else {
    // determine the drive on which user's home folder is stored
    const homeRoot = path.parse(home).root; // e.g. C:\
    const homeDrive = homeRoot.replaceAll(':\\', ''); // e.g. C drive.

    // code below inspired by
    // https://stackoverflow.com/a/52411712/769192

    try {
      const wmic = await util.promisify(exec)('wmic logicaldisk get name');
      // parsing wmic output
      const drives = wmic.stdout
        .split('\r\n')
        .filter((line) => line.includes(':'))
        .map((line) => line.trim().replaceAll(':', ''));

      return drives.map((drive) => {
        const isHomeDrive = drive == homeDrive;
        return {
          name: `local_disk_${drive}`,
          root: `${drive}:\\`,
          initialPath: isHomeDrive ? home : `${drive}:\\`
        };
      });
    } catch (e: any) {
      return [
        {
          name: `local_disk_${homeDrive}`,
          root: `${homeDrive}:\\`,
          initialPath: home
        }
      ];
    }
  }
}
