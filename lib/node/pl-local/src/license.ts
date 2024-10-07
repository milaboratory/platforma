import path from 'path';
import os from 'os';
import { assertNever, fileExists } from "@milaboratories/ts-helpers";

export type License = {
  type: 'value',
  value: string;
} | {
  type: 'file',
  file: string;
}

export async function getLicenseFromEnv(): Promise<License> {
  let license = undefined;
  if ((process.env.MI_LICENSE ?? '') != '') license = process.env.MI_LICENSE;
  else if ((process.env.PL_LICENSE ?? '') != '') license = process.env.PL_LICENSE;
  if (license !== undefined)
    return {
      type: 'value',
      value: license
    }

  // set 'license-file' only if license is still undefined
  let licenseFile = undefined;
  if ((process.env.MI_LICENSE_FILE ?? '') != '') licenseFile = process.env.MI_LICENSE_FILE;
  else if ((process.env.PL_LICENSE_FILE ?? '') != '') licenseFile = process.env.PL_LICENSE_FILE;
  else if (await fileExists(path.resolve(os.homedir(), '.pl.license')))
    licenseFile = path.resolve(os.homedir(), '.pl.license');

  if (licenseFile !== undefined)
    return {type: 'file', file: licenseFile};

  throw new Error('no license in envs');
}

export function mergeLicense(license: License, config: any) {
  if (license.type == 'value')
    config['license']['value'] = license.value
  else if (license.type == 'file')
    config['license']['file'] = license.file
  else
    assertNever(license);
}
